import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
function putEnv(path, name, value) {
  const source = readFileSync(path, "utf8");
  const pattern = new RegExp(`^${name}=.*$`, "m");
  writeFileSync(
    path,
    pattern.test(source)
      ? source.replace(pattern, `${name}=${value}`)
      : `${source.trimEnd()}\n${name}=${value}\n`,
    { mode: 0o600 },
  );
}
try {
  const operator = new URL(process.env.DATABASE_URL || "");
  const database = decodeURIComponent(operator.pathname.slice(1));
  if (
    operator.protocol !== "mysql:" ||
    !["localhost", "127.0.0.1"].includes(operator.hostname) ||
    !/^[a-zA-Z0-9_]{1,64}$/.test(database)
  )
    throw Error("LOCAL_CONFIGURATION_REQUIRED");
  const existing = process.env.LOCAL_RUNTIME_DATABASE_URL;
  const runtime = existing ? new URL(existing) : new URL(operator);
  if (
    existing &&
    (runtime.username !== "tradecrafters_web" ||
      !/^[a-f0-9]{64}$/.test(runtime.password) ||
      runtime.hostname !== operator.hostname ||
      runtime.port !== operator.port ||
      runtime.pathname !== operator.pathname)
  )
    throw Error("INVALID_LOCAL_RUNTIME_IDENTITY");
  if (!existing) {
    runtime.username = "tradecrafters_web";
    runtime.password = randomBytes(32).toString("hex");
  }
  const container = execFileSync(
    "docker",
    ["compose", "--env-file", ".env.local", "ps", "-q", "mysql"],
    {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  ).trim();
  if (!/^[a-f0-9]{12,64}$/.test(container))
    throw Error("LOCAL_DATABASE_NOT_RUNNING");
  const grants = {
    user: "SELECT,INSERT,UPDATE,DELETE",
    session: "SELECT,INSERT,UPDATE,DELETE",
    account: "SELECT,INSERT,UPDATE,DELETE",
    verification: "SELECT,INSERT,UPDATE,DELETE",
    twoFactor: "SELECT,INSERT,UPDATE,DELETE",
    rateLimit: "SELECT,INSERT,UPDATE,DELETE",
    simulation_accounts: "SELECT,INSERT",
    wallets: "SELECT,INSERT,UPDATE",
    cash_journals: "SELECT,INSERT",
    cash_entries: "SELECT,INSERT",
    mutation_budgets: "SELECT,INSERT,UPDATE",
    admin_roles: "SELECT",
    security_audit: "SELECT,INSERT",
    simulation_control: "SELECT,UPDATE",
    mfa_stepups: "SELECT,INSERT,UPDATE,DELETE",
    mfa_used_codes: "SELECT,INSERT,DELETE",
    mfa_attempt_budgets: "SELECT,INSERT,UPDATE",
    currencies: "SELECT",
    mic_records: "SELECT",
    securities: "SELECT",
    listings: "SELECT",
    provider_aliases: "SELECT",
    provider_alias_namespaces: "SELECT",
    venue_capabilities: "SELECT",
    market_calendar_versions: "SELECT",
    trading_rule_versions: "SELECT",
    listing_policy_versions: "SELECT",
    listing_policy_permissions: "SELECT",
    listing_halts: "SELECT",
    catalog_policy_audit: "SELECT",
    catalog_audit: "SELECT",
    catalog_snapshots: "SELECT",
    mic_record_versions: "SELECT",
    catalog_snapshot_changes: "SELECT",
    venue_classifications: "SELECT",
    market_capability_versions: "SELECT",
  };
  const identity = "'tradecrafters_web'@'%'";
  const statements = [
    `CREATE USER IF NOT EXISTS ${identity} IDENTIFIED BY '${runtime.password}'`,
    `ALTER USER ${identity} IDENTIFIED BY '${runtime.password}'`,
    `REVOKE ALL PRIVILEGES, GRANT OPTION FROM ${identity}`,
    ...Object.entries(grants).map(
      ([table, privileges]) =>
        `GRANT ${privileges} ON \`${database}\`.\`${table}\` TO ${identity}`,
    ),
  ];
  // The root password stays inside the existing container environment. No credential enters process arguments or logs.
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "sh",
      "-c",
      'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --user=root',
    ],
    {
      input: statements.join(";\n") + ";\n",
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  putEnv(
    resolve(root, ".env.local"),
    "LOCAL_RUNTIME_DATABASE_URL",
    runtime.href,
  );
  putEnv(resolve(root, "apps/web/.env.local"), "DATABASE_URL", runtime.href);
  console.log(
    "Configured a separate local web identity with table-level grants. Operator credentials and OAuth configuration were preserved; values hidden.",
  );
} catch {
  console.error(
    "Runtime identity setup failed. Check local Docker/MySQL configuration and migrations; no credential values are printed.",
  );
  process.exitCode = 1;
}
