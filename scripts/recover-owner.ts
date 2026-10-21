import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createPool, type RowDataPacket } from "mysql2/promise";
import { databaseConfiguration } from "@tradecrafters/database/pool";
import { recoverOwnerIdentity } from "./operations/identity-recovery";

// Keep the case manifest private, retain its UUID after a lost response, and
// review the exact user/provider/schema before execution. No role is regranted.
let pool: ReturnType<typeof createPool> | undefined;
try {
  assert.equal(process.argv[2], "--execute-reviewed-owner-recovery");
  assert.ok(process.argv[3] && process.env.RECOVERY_OPERATOR_DATABASE_URL);
  assert.equal(process.env.AUTH_DEV_CREDENTIALS, "false");
  const plan = JSON.parse(await readFile(process.argv[3], "utf8")) as {
    userId: string;
    githubId: string;
    caseKey: string;
    database: string;
    host: string;
    action: string;
    ownerReviewed: boolean;
  };
  assert.equal(plan.action, "revoke-role-sessions-and-factor");
  assert.equal(plan.ownerReviewed, true);
  const gh = (args: string[]) =>
    execFileSync("gh", args, {
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const authenticated = gh(["api", "user", "--jq", ".id"]);
  const repositoryOwner = gh([
    "api",
    "repos/DuhItzAniket/TradeCrafters",
    "--jq",
    ".owner.id",
  ]);
  assert.equal(
    authenticated,
    repositoryOwner,
    "Independent GitHub repository-owner authentication required.",
  );
  assert.equal(plan.githubId, repositoryOwner);
  const config = databaseConfiguration({
    ...process.env,
    DATABASE_URL: process.env.RECOVERY_OPERATOR_DATABASE_URL,
    MYSQL_POOL_SIZE: "1",
  });
  assert.ok(config.ssl);
  assert.equal(config.host, plan.host);
  assert.equal(config.database, plan.database);
  assert.notEqual(config.user, "tc_preview_web");
  pool = createPool({ ...config, connectionLimit: 1 });
  const [target] = await pool.query<RowDataPacket[]>(
    "SELECT DATABASE() AS name",
  );
  assert.equal(target[0].name, plan.database);
  const result = await recoverOwnerIdentity(pool, plan);
  console.log(
    JSON.stringify({
      ...result,
      adminRegrant: false,
      next: "Fresh provider sign-in, new authenticator enrollment and an independently reviewed admin grant are required. Private values hidden.",
    }),
  );
} catch {
  console.error(
    "Owner recovery was not confirmed. Private proof/manifest/driver details hidden. Recover the same case key before retrying; never generate a new case after an unknown outcome.",
  );
  process.exitCode = 1;
} finally {
  await pool?.end();
}
