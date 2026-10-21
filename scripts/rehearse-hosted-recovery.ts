import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createConnection,
  createPool,
  type Pool,
  type Connection,
  type RowDataPacket,
} from "mysql2/promise";
import { databaseConfiguration } from "@tradecrafters/database/pool";
import { closePool } from "@tradecrafters/database";
import { migrate } from "@tradecrafters/database/migrate";
import {
  readSnapshot,
  restoreSnapshot,
  restoreMaintenance,
  discardRestoredAuthority,
  captureSnapshot,
  snapshotFingerprint,
} from "./operations/database-snapshot";
import { openBackup } from "./operations/backup-envelope";

// No existing-target option. Every run provisions its own random, capped
// restore identity/schema; it has no app URL, OAuth app or public runtime.
const run = randomBytes(8).toString("hex");
const database = `tc_restore_${run}`,
  user = `tc_restore_${run}`;
const password = randomBytes(32).toString("hex");
let admin: Connection | undefined, target: Pool | undefined;
let createdDatabase = false,
  createdUser = false,
  key: Buffer | undefined;
let stage = "private configuration";
const started = performance.now();
const report: Record<string, unknown> = {
  run,
  scope:
    "actual hosted logical restore into a new unexposed schema; not provider PITR/failover",
};
try {
  assert.equal(process.argv[2], "--create-disposable-hosted-restore");
  assert.ok(
    process.env.RESTORE_OPERATOR_DATABASE_URL &&
      process.env.BACKUP_ARCHIVE &&
      process.env.BACKUP_KEY_FILE,
  );
  const source = new URL(process.env.DATABASE_URL!);
  const operator = new URL(process.env.RESTORE_OPERATOR_DATABASE_URL);
  assert.equal(source.hostname, operator.hostname);
  assert.equal(source.port, operator.port);
  assert.notEqual(source.pathname, `/${database}`);
  assert.equal(source.pathname.slice(1), process.env.BACKUP_EXPECTED_DATABASE);
  assert.notEqual(source.username, operator.username);
  const raw = (await readFile(process.env.BACKUP_KEY_FILE!, "utf8")).trim();
  assert.match(raw, /^[a-f0-9]{64}$/);
  key = Buffer.from(raw, "hex");
  // Authenticate/decode BEFORE any schema is created or any SQL is executed.
  const snapshot = await readSnapshot(
    openBackup(await readFile(process.env.BACKUP_ARCHIVE!), key),
  );
  const config = databaseConfiguration({
    ...process.env,
    DATABASE_URL: operator.href,
    MYSQL_POOL_SIZE: "1",
  });
  assert.ok(config.ssl);
  admin = await createConnection(config);
  stage = "new target guard";
  const [existing] = await admin.execute<RowDataPacket[]>(
    "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?",
    [database],
  );
  assert.equal(existing.length, 0);
  const [capacity] = await admin.query<RowDataPacket[]>(
    "SELECT @@max_connections AS n",
  );
  assert.ok(
    Number(capacity[0].n) >= 34,
    "Preserve the measured application/operator reserve.",
  );
  await admin.query(
    `CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`,
  );
  createdDatabase = true;
  await admin.query(
    `CREATE USER '${user}'@'%' IDENTIFIED BY '${password}' REQUIRE SSL WITH MAX_USER_CONNECTIONS 2`,
  );
  createdUser = true;
  await admin.query(
    `GRANT SELECT,INSERT,UPDATE,DELETE,CREATE,ALTER,INDEX,DROP,REFERENCES,TRIGGER,EVENT ON \`${database}\`.* TO '${user}'@'%'`,
  );
  const url = new URL(operator.href);
  url.username = user;
  url.password = password;
  url.pathname = `/${database}`;
  process.env.DATABASE_URL = url.href;
  process.env.MYSQL_POOL_SIZE = "1";
  stage = "reviewed schema migrations";
  await migrate();
  await closePool();
  target = createPool({ ...databaseConfiguration(), connectionLimit: 1 });
  stage = "logical restore and foreign key validation";
  const restoreStarted = performance.now();
  await restoreSnapshot(target, snapshot, database);
  const restored = await captureSnapshot(target);
  assert.deepEqual(
    snapshotFingerprint(restored),
    snapshotFingerprint(snapshot),
  );
  report.fingerprint = snapshotFingerprint(restored);
  report.restoreAndVerifyMs = Math.round(performance.now() - restoreStarted);
  stage = "accounting reconciliation";
  for (const sql of [
    "SELECT j.id FROM cash_journals j LEFT JOIN cash_entries e ON e.journal_id=j.id GROUP BY j.id HAVING COALESCE(SUM(e.amount_minor),1)<>0 OR COUNT(e.bucket)<>2",
    "SELECT w.account_id,w.currency FROM wallets w LEFT JOIN cash_journals j ON j.account_id=w.account_id AND j.currency=w.currency LEFT JOIN cash_entries e ON e.journal_id=j.id AND e.bucket='wallet' GROUP BY w.account_id,w.currency,w.balance_minor HAVING w.balance_minor<>COALESCE(SUM(e.amount_minor),0)",
  ]) {
    const result: [RowDataPacket[], unknown] =
      await target.query<RowDataPacket[]>(sql);
    assert.equal(result[0].length, 0);
  }
  report.accountingReconciled = true;
  stage = "discard restored session authority";
  // Do not resurrect cookies/step-ups that were revoked after the snapshot.
  // No owner source session is read or revoked by this rehearsal.
  Object.assign(report, await discardRestoredAuthority(target, database));
  stage = "restore reviewed maintenance";
  report.maintenance = await restoreMaintenance(target, database);
  await target.end();
  target = undefined;
  stage = "migration checksum recheck";
  await migrate();
  await closePool();
  report.completedAt = new Date().toISOString();
  report.elapsedMs = Math.round(performance.now() - started);
  report.snapshotAgeSecondsAtFinish = Math.round(
    (Date.now() - Date.parse(snapshot.capturedAt)) / 1000,
  );
} catch {
  report.failedStage = stage;
  console.error(
    `Hosted recovery rehearsal failed at ${stage}. Credentials, private records and database errors hidden.`,
  );
  process.exitCode = 1;
} finally {
  key?.fill(0);
  await target?.end().catch(() => {
    report.cleanupFailed = true;
    process.exitCode = 1;
  });
  await closePool().catch(() => {
    report.cleanupFailed = true;
    process.exitCode = 1;
  });
  // Try each cleanup independently: a failed schema removal must not leave the
  // temporary identity enabled simply because it followed the failed step.
  for (const [created, sql, field] of [
    [
      createdDatabase,
      `DROP DATABASE \`${database}\``,
      "disposableTargetRemoved",
    ],
    [createdUser, `DROP USER '${user}'@'%'`, "disposableIdentityRemoved"],
  ] as const) {
    report[field] = false;
    if (!created) continue;
    try {
      await admin!.query(sql);
      report[field] = true;
    } catch {
      report.cleanupFailed = true;
      process.exitCode = 1;
    }
  }
  await admin?.end();
  await writeFile(
    resolve(".local/hosting/hosted-recovery-report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
}
