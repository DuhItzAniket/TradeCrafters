import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "@tradecrafters/database";
import { authConfiguration } from "@tradecrafters/database/auth";
import { databaseConfiguration } from "@tradecrafters/database/pool";
import runtimeGrants from "../../packages/database/runtime-grants.json" with { type: "json" };

export class PreflightFailure extends Error {
  constructor(public check: string) {
    super(`Release preflight failed: ${check}. Values hidden.`);
  }
}
const fail = (check: string): never => {
  throw new PreflightFailure(check);
};
export function webEnvironment(env: NodeJS.ProcessEnv = process.env) {
  for (const name of [
    "OPERATOR_DATABASE_URL",
    "MIGRATION_DATABASE_URL",
    "LOCAL_RUNTIME_DATABASE_URL",
    "LOCAL_DB_PASSWORD",
    "LOCAL_DB_ROOT_PASSWORD",
  ])
    if (env[name]) fail("privileged credentials in web environment");
}
function privileges(value: string) {
  return (
    value
      .replace(/[`\"]/g, "")
      .toUpperCase()
      .match(/[A-Z]+(?:\s*\([^)]*\))?/g) || []
  )
    .map((part) =>
      part
        .replace(/\s/g, "")
        .replace(
          /\(([^)]*)\)/,
          (_, cols: string) => `(${cols.split(",").sort().join(",")})`,
        ),
    )
    .sort()
    .join("|");
}
export function exactRuntimeGrants(
  grants: string[],
  database: string,
): boolean {
  const found = new Set<string>();
  for (const grant of grants) {
    if (/^GRANT USAGE ON \*\.\* TO /.test(grant) && !/GRANT OPTION/.test(grant))
      continue;
    // Reject inherited roles, wildcard schema grants and any extra privilege.
    const match = grant.match(
      /^GRANT (.+) ON ([`"])([a-zA-Z0-9_]+)\2\.([`"])([a-zA-Z0-9_]+)\4 TO ([`"])[^`"]+\6@([`"])[^`"]+\7$/,
    );
    if (
      !match ||
      match[3] !== database ||
      !Object.hasOwn(runtimeGrants, match[5])
    )
      return false;
    if (
      privileges(match[1]) !==
      privileges(runtimeGrants[match[5] as keyof typeof runtimeGrants])
    )
      return false;
    found.add(match[5]);
  }
  return found.size === Object.keys(runtimeGrants).length;
}
export function connectionBudget(
  serverMax: number,
  userCap: number,
  reserved: number,
  poolSize: number,
) {
  if (
    ![serverMax, userCap, reserved, poolSize].every(Number.isSafeInteger) ||
    serverMax < 2 ||
    reserved < 1 ||
    reserved >= serverMax ||
    userCap < poolSize ||
    userCap > serverMax - reserved ||
    poolSize < 1
  )
    fail("aggregate connection budget");
  return {
    serverMax,
    userCap,
    reserved,
    connectionsPerProcess: poolSize,
    nominalFullPools: Math.floor(userCap / poolSize),
  };
}
export async function inspectRuntime(localFixture = false) {
  webEnvironment();
  const auth = authConfiguration(),
    config = databaseConfiguration();
  const local = ["127.0.0.1", "localhost"].includes(String(config.host));
  if (localFixture) {
    if (
      !local ||
      !["127.0.0.1", "localhost"].includes(auth.url.hostname) ||
      process.env.NODE_ENV === "production" ||
      !auth.developmentCredentials
    )
      fail("local fixture guard");
  } else if (
    process.env.NODE_ENV !== "production" ||
    local ||
    auth.url.protocol !== "https:" ||
    auth.developmentCredentials ||
    !auth.github ||
    !config.ssl
  )
    fail("hosted production configuration");
  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    const [ssl] = await connection.query<RowDataPacket[]>(
      "SHOW SESSION STATUS LIKE 'Ssl_cipher'",
    );
    const tlsActive = Boolean(ssl[0]?.Value);
    if (!localFixture && !tlsActive) fail("active database TLS");
    const [grants] = await connection.query<RowDataPacket[]>(
      "SHOW GRANTS FOR CURRENT_USER()",
    );
    if (
      !exactRuntimeGrants(
        grants.map((row) => String(Object.values(row)[0])),
        String(config.database),
      )
    )
      fail("exact runtime grant contract");
    // Actual denials, with no write/DDL attempt or credential retrieval.
    for (const statement of [
      "SELECT name FROM schema_migrations LIMIT 0",
      "SELECT User FROM mysql.user LIMIT 0",
    ]) {
      try {
        await connection.query(statement);
        fail("runtime privilege denial");
      } catch (error) {
        if (
          !error ||
          typeof error !== "object" ||
          !("code" in error) ||
          ![
            "ER_TABLEACCESS_DENIED_ERROR",
            "ER_DBACCESS_DENIED_ERROR",
            "ER_SPECIFIC_ACCESS_DENIED_ERROR",
          ].includes(String(error.code))
        )
          throw error;
      }
    }
    for (const table of Object.keys(runtimeGrants))
      await connection.query(`SELECT 1 FROM \`${table}\` LIMIT 0`);
    await connection.query(
      "SELECT state,version,grant_snapshot,active_owner FROM simulation_accounts LIMIT 0",
    );
    await connection.query(
      "SELECT id,receipt,http_status FROM operation_records LIMIT 0",
    );
    const [control] = await connection.query<RowDataPacket[]>(
      "SELECT id FROM simulation_control WHERE id=1",
    );
    const [catalog] = await connection.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS count FROM listings WHERE id LIKE 'sim-%'",
    );
    if (control.length !== 1 || Number(catalog[0].count) !== 10)
      fail("seeded synthetic prototype");
    const [max] = await connection.query<RowDataPacket[]>(
      "SELECT @@max_connections AS server_max",
    );
    // SHOW CREATE USER for oneself includes authentication details on some
    // servers. Never return or log the statement, even on failure.
    const [identity] = await connection.query<RowDataPacket[]>(
      "SHOW CREATE USER CURRENT_USER()",
    );
    const create = String(Object.values(identity[0])[0]);
    const userCap = Number(
      create.match(/\bMAX_USER_CONNECTIONS\s+(\d+)/)?.[1] || 0,
    );
    const reserved = Number(
      process.env.MYSQL_RESERVED_CONNECTIONS ||
        Math.max(10, Math.ceil(Number(max[0].server_max) / 4)),
    );
    const budget = localFixture
      ? null
      : connectionBudget(
          Number(max[0].server_max),
          userCap,
          reserved,
          Number(config.connectionLimit),
        );
    return {
      scope: localFixture
        ? "local fixture; not hosted acceptance"
        : "hosted runtime preflight; release checklist still required",
      tlsActive,
      exactGrants: true,
      privilegeDenials: true,
      requiredTablesReadable: true,
      syntheticListings: 10,
      connectionBudget: budget,
    };
  } finally {
    connection.release();
  }
}
