import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createPool } from "mysql2/promise";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
const raw = process.env.LOCAL_RUNTIME_DATABASE_URL;
assert.ok(
  raw,
  "Run npm run setup:db-identities before integration verification",
);
const url = new URL(raw);
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname));
const pool = createPool(raw);
after(async () => pool.end());
function denied(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    [
      "ER_ACCESS_DENIED_ERROR",
      "ER_TABLEACCESS_DENIED_ERROR",
      "ER_COLUMNACCESS_DENIED_ERROR",
      "ER_DBACCESS_DENIED_ERROR",
      "ER_PROCACCESS_DENIED_ERROR",
      "ER_SPECIFIC_ACCESS_DENIED_ERROR",
    ].includes(String(error.code))
  );
}
test("the web identity can read required data and take read-only role locks", async () => {
  const appEnv = parseEnv(readFileSync("apps/web/.env.local", "utf8"));
  assert.equal(
    appEnv.DATABASE_URL === raw,
    true,
    "the app must use the restricted runtime URL (values hidden)",
  );
  for (const key of [
    "OPERATOR_DATABASE_URL",
    "MIGRATION_DATABASE_URL",
    "LOCAL_DB_ROOT_PASSWORD",
    "LOCAL_DB_PASSWORD",
    "LOCAL_RUNTIME_DATABASE_URL",
  ])
    assert.equal(
      key in appEnv,
      false,
      `${key} must stay outside the web environment`,
    );
  for (const table of [
    "user",
    "session",
    "simulation_accounts",
    "wallets",
    "admin_roles",
    "catalog_snapshots",
    "provider_aliases",
    "venue_classifications",
    "ingress_budget_control",
    "ingress_budget_clients",
  ])
    await pool.query(`SELECT 1 FROM \`${table}\` LIMIT 1`);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query("SELECT user_id FROM admin_roles LIMIT 1 FOR SHARE");
    await connection.rollback();
  } finally {
    connection.release();
  }
});
test("the web identity cannot grant roles, rewrite journals/audits/catalogs or access migration history", async () => {
  for (const statement of [
    "UPDATE admin_roles SET user_id=user_id WHERE false",
    "DELETE FROM admin_roles WHERE false",
    "UPDATE security_audit SET reason=reason WHERE false",
    "DELETE FROM security_audit WHERE false",
    "UPDATE cash_journals SET kind=kind WHERE false",
    "DELETE FROM cash_entries WHERE false",
    "UPDATE provider_aliases SET alias=alias WHERE false",
    "UPDATE venue_classifications SET classification=classification WHERE false",
    "UPDATE catalog_audit SET reason=reason WHERE false",
    "SELECT 1 FROM schema_migrations LIMIT 1",
    "UPDATE simulation_accounts SET grant_snapshot=grant_snapshot WHERE false",
    "UPDATE simulation_accounts SET reporting_currency=reporting_currency WHERE false",
    "UPDATE simulation_accounts SET user_id=user_id WHERE false",
    "UPDATE operation_records SET receipt=receipt WHERE false",
    "DELETE FROM fills WHERE false",
    "UPDATE market_snapshots SET definition=definition WHERE false",
    "UPDATE fx_quotes SET definition=definition WHERE false",
    "DELETE FROM fx_conversions WHERE false",
    "UPDATE ingress_budget_control SET scope=scope WHERE false",
    "DELETE FROM ingress_budget_control WHERE false",
    "INSERT INTO ingress_budget_control (scope) VALUES ('read')",
  ])
    await assert.rejects(pool.query(statement), denied);
});
test("the web identity cannot create tables, grant database privileges or inspect MySQL credentials", async () => {
  await assert.rejects(
    pool.query(
      "CREATE EVENT runtime_identity_must_not_create ON SCHEDULE AT CURRENT_TIMESTAMP + INTERVAL 1 HOUR DO SELECT 1",
    ),
    denied,
  );
  await assert.rejects(
    pool.query("CREATE TABLE runtime_identity_must_not_create (id INT)"),
    denied,
  );
  await assert.rejects(
    pool.query("SELECT authentication_string FROM mysql.user LIMIT 1"),
    denied,
  );
  const database = decodeURIComponent(url.pathname.slice(1));
  assert.match(database, /^[a-zA-Z0-9_]{1,64}$/);
  // Regranting an existing table read would add no privilege even if this check regressed.
  await assert.rejects(
    pool.query(`GRANT SELECT ON \`${database}\`.currencies TO CURRENT_USER`),
    denied,
  );
});
