import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createPool, type Pool, type RowDataPacket } from "mysql2/promise";
import {
  createAccount,
  seedCatalog,
  getPool,
  closePool,
} from "@tradecrafters/database";
import { migrate } from "@tradecrafters/database/migrate";
import { seedCatalogSnapshot } from "@tradecrafters/database/catalog";
import { seedMarketPolicies } from "../packages/database/src/policy-fixtures";
import { seedProviderAliases } from "@tradecrafters/database/aliases";
import {
  issueTrainingQuote,
  submitOrder,
  issueFxQuote,
  convertFx,
  resetAccount,
  operationByKey,
} from "@tradecrafters/database/trading";
import { sealBackup, openBackup } from "./operations/backup-envelope";
import {
  captureSnapshot,
  snapshotBytes,
  readSnapshot,
  snapshotFingerprint,
  restoreSnapshot,
  restoreMaintenance,
  discardRestoredAuthority,
} from "./operations/database-snapshot";

// This command has no restore-target option. It only touches a newly named,
// disposable container and its tmpfs. It never reads an existing .env file.
const runId = randomBytes(8).toString("hex"),
  container = `tc-recovery-${runId}`;
const folder = resolve(".local/recovery"),
  envFile = resolve(folder, `${runId}.env`),
  backupFile = resolve(folder, `${runId}.tcbackup`);
const rootPassword = randomBytes(32).toString("hex"),
  key = randomBytes(32);
const started = performance.now();
let created = false,
  inspector: Pool | undefined;
let stage = "start disposable server";
function docker(args: string[], input?: Buffer | string) {
  return execFileSync("docker", args, {
    input,
    encoding: "buffer",
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
}
function mysql(
  database: "source_fixture" | "restored_fixture",
  input: Buffer | string,
) {
  return docker(
    [
      "exec",
      "-i",
      container,
      "sh",
      "-c",
      `MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --user=root --database=${database}`,
    ],
    input,
  );
}
async function fingerprint(pool: Pool) {
  const [tables] = await pool.query<RowDataPacket[]>("SHOW TABLES");
  const hash = createHash("sha256");
  let rowCount = 0;
  for (const table of tables
    .map((row) => String(Object.values(row)[0]))
    .sort()) {
    assert.match(table, /^[a-zA-Z0-9_]+$/);
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM \`${table}\``,
    );
    rowCount += rows.length;
    hash.update(
      JSON.stringify([table, rows.map((row) => JSON.stringify(row)).sort()]),
    );
  }
  return { tables: tables.length, rows: rowCount, digest: hash.digest("hex") };
}
try {
  await mkdir(folder, { recursive: true });
  await writeFile(
    envFile,
    `MYSQL_ROOT_PASSWORD=${rootPassword}\nMYSQL_ROOT_HOST=%\n`,
    { mode: 0o600, flag: "wx" },
  );
  docker([
    "run",
    "--detach",
    "--name",
    container,
    "--label",
    "tradecrafters.disposable=recovery",
    "--env-file",
    envFile,
    "--publish",
    "127.0.0.1::3306",
    "--tmpfs",
    "/var/lib/mysql:rw,size=1g",
    "mysql:8.4",
  ]);
  created = true;
  const binding = docker(["port", container, "3306/tcp"]).toString().trim();
  assert.match(binding, /^127\.0\.0\.1:\d+$/);
  const port = Number(binding.split(":")[1]);
  inspector = createPool({
    host: "127.0.0.1",
    port,
    user: "root",
    password: rootPassword,
    connectionLimit: 1,
    connectTimeout: 1000,
    supportBigNumbers: true,
    bigNumberStrings: true,
    timezone: "Z",
  });
  let ready = false;
  for (let i = 0; i < 120; i++) {
    try {
      await inspector.query("SELECT 1");
      ready = true;
      break;
    } catch {
      await delay(500);
    }
  }
  assert.ok(ready, "disposable MySQL did not become ready");
  await inspector.query("CREATE DATABASE source_fixture");
  await inspector.query("CREATE DATABASE restored_fixture");
  const sourceUrl = `mysql://root:${rootPassword}@127.0.0.1:${port}/source_fixture`;
  process.env.DATABASE_URL = sourceUrl;
  process.env.MYSQL_SSL = "false";
  process.env.MYSQL_POOL_SIZE = "5";
  delete process.env.MYSQL_SSL_CA;
  delete process.env.MYSQL_SSL_CA_FILE;
  await migrate();
  stage = "seed catalog snapshot";
  await seedCatalogSnapshot();
  stage = "seed scenarios";
  await seedCatalog();
  stage = "seed market policies";
  await seedMarketPolicies();
  stage = "seed aliases";
  await seedProviderAliases();
  stage = "create fixture identity";
  const id = randomUUID(),
    sessionId = randomUUID(),
    sessionToken = randomBytes(32).toString("hex");
  await getPool().execute(
    "INSERT INTO user (id,name,email,emailVerified,twoFactorEnabled) VALUES (?,'Recovery fixture',?,true,true)",
    [id, `${id}@example.test`],
  );
  await getPool().execute(
    "INSERT INTO session (id,userId,token,expiresAt,updatedAt) VALUES (?,?,?,DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 1 DAY),UTC_TIMESTAMP(3))",
    [sessionId, id, sessionToken],
  );
  // Opaque fictional factor records are checked byte-for-byte. This is not a
  // hosted authenticator recovery rehearsal or a real person's identity.
  await getPool().execute(
    "INSERT INTO twoFactor (id,userId,secret,backupCodes,verified) VALUES (?,?,?,?,true)",
    [
      randomUUID(),
      id,
      "fixture-encrypted-factor",
      "fixture-encrypted-recovery",
    ],
  );
  const account = await createAccount(id, "USD");
  assert.ok(account);
  const actor = { userId: id, sessionId };
  stage = "execute fixture trades";
  for (const side of ["BUY", "SELL"] as const) {
    const { quote } = await issueTrainingQuote(id, account.id, "sim-xnas-kite");
    const result = await submitOrder(actor, randomUUID(), {
      accountId: account.id,
      listingId: quote.listingId,
      quoteId: quote.id,
      quantity: 1,
      side,
      orderType: "MARKET",
    });
    assert.equal(result.receipt.status, "filled");
  }
  const fxQuote = await issueFxQuote(id, account.id, "USD", "JPY");
  stage = "execute fixture FX";
  const fx = await convertFx(actor, randomUUID(), {
    accountId: account.id,
    quoteId: fxQuote.id,
    sourceMinor: "10000",
  });
  assert.equal(fx.receipt.status, "converted");
  const resetKey = randomUUID();
  stage = "archive fixture account";
  const reset = await resetAccount(actor, resetKey, {
    accountId: account.id,
    confirmation: "RESET",
  });
  assert.equal(reset.receipt.status, "reset");
  const before = await fingerprint(getPool());
  const logicalSnapshot = await captureSnapshot(getPool());
  const logicalEncrypted = sealBackup(snapshotBytes(logicalSnapshot), key);
  stage = "encrypt snapshot";
  const backupStarted = performance.now();
  // Single InnoDB snapshot; no DDL or concurrent writers run in this fixture.
  const dump = docker([
    "exec",
    container,
    "sh",
    "-c",
    'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump --user=root --events --single-transaction --quick --skip-lock-tables --no-tablespaces --set-gtid-purged=OFF --hex-blob source_fixture',
  ]);
  await writeFile(backupFile, sealBackup(dump, key), {
    mode: 0o600,
    flag: "wx",
  });
  const encrypted = await readFile(backupFile);
  assert.equal(encrypted.includes(Buffer.from(sessionToken)), false);
  assert.throws(
    () => openBackup(encrypted, randomBytes(32)),
    /authentication failed/,
  );
  const corrupt = Buffer.from(encrypted);
  corrupt[corrupt.length - 1] ^= 1;
  assert.throws(() => openBackup(corrupt, key), /authentication failed/);
  const backupMs = Math.round(performance.now() - backupStarted);
  await closePool();
  stage = "restore snapshot";
  const restoreStarted = performance.now();
  mysql("restored_fixture", openBackup(encrypted, key));
  process.env.DATABASE_URL = sourceUrl.replace(
    "/source_fixture",
    "/restored_fixture",
  );
  assert.deepEqual(
    await fingerprint(getPool()),
    before,
    "every restored table and row must match the snapshot",
  );
  stage = "reconcile restored records";
  const [maintenance] = await getPool().query<RowDataPacket[]>(
    "SELECT EVENT_NAME,STATUS,EVENT_DEFINITION FROM information_schema.events WHERE EVENT_SCHEMA=DATABASE()",
  );
  assert.equal(maintenance.length, 2);
  assert.ok(maintenance.every((row) => row.STATUS === "ENABLED"));
  assert.ok(
    maintenance.some(
      (row) =>
        row.EVENT_NAME === "ingress_counter_expiry" &&
        row.EVENT_DEFINITION.includes("ingress_budget_clients"),
    ),
  );
  assert.ok(
    maintenance.some(
      (row) =>
        row.EVENT_NAME === "auth_counter_expiry" &&
        row.EVENT_DEFINITION.includes("rateLimit"),
    ),
  );
  await migrate(); // All checksums must match, with no migration reapplication.
  assert.deepEqual(
    await operationByKey(id, account.id, resetKey),
    reset,
    "archived-account receipt recovery must survive restore",
  );
  const [imbalanced] = await getPool().query<RowDataPacket[]>(
    "SELECT j.id FROM cash_journals j LEFT JOIN cash_entries e ON e.journal_id=j.id GROUP BY j.id HAVING COALESCE(SUM(e.amount_minor),1)<>0 OR COUNT(e.bucket)<>2",
  );
  assert.equal(imbalanced.length, 0);
  const [walletMismatch] = await getPool().query<RowDataPacket[]>(
    "SELECT w.account_id,w.currency FROM wallets w LEFT JOIN cash_journals j ON j.account_id=w.account_id AND j.currency=w.currency LEFT JOIN cash_entries e ON e.journal_id=j.id AND e.bucket='wallet' GROUP BY w.account_id,w.currency,w.balance_minor HAVING w.balance_minor<>COALESCE(SUM(e.amount_minor),0)",
  );
  assert.equal(walletMismatch.length, 0);
  const [positionMismatch] = await getPool().query<RowDataPacket[]>(
    "SELECT p.account_id,p.listing_id FROM positions p JOIN (SELECT o.account_id,o.listing_id,SUM(IF(o.side='BUY',o.quantity,-CAST(o.quantity AS SIGNED))) AS quantity,SUM(IF(o.side='BUY',CAST(JSON_UNQUOTE(JSON_EXTRACT(f.definition,'$.notionalMinor')) AS DECIMAL(30,0)),-CAST(JSON_UNQUOTE(JSON_EXTRACT(f.definition,'$.allocatedBasisMinor')) AS DECIMAL(30,0)))) AS basis,SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(f.definition,'$.realizedMinor')) AS DECIMAL(30,0))) AS realized FROM orders o JOIN fills f ON f.order_id=o.id GROUP BY o.account_id,o.listing_id) expected ON expected.account_id=p.account_id AND expected.listing_id=p.listing_id WHERE p.quantity<>expected.quantity OR p.cost_basis_minor<>expected.basis OR p.realized_minor<>expected.realized",
  );
  assert.equal(positionMismatch.length, 0);
  stage = "verify restored execution guards";
  const guard = await getPool().getConnection();
  try {
    await guard.beginTransaction();
    await guard.query(
      "UPDATE simulation_control SET execution_paused=true WHERE id=1",
    );
    const blocked = (error: unknown) =>
      error instanceof Error &&
      "sqlState" in error &&
      error.sqlState === "45000" &&
      "sqlMessage" in error &&
      error.sqlMessage === "TRADECRAFTERS_EXECUTION_PAUSED";
    await assert.rejects(
      guard.execute(
        "INSERT INTO orders (id,account_id,listing_id,side,quantity) VALUES (?,?,'sim-xnas-kite','BUY',1)",
        [randomUUID(), account.id],
      ),
      blocked,
    );
    await assert.rejects(
      guard.execute(
        "INSERT INTO fx_conversions (id,account_id,quote_id,source_journal_id,target_journal_id,definition) SELECT ?,account_id,quote_id,source_journal_id,target_journal_id,definition FROM fx_conversions LIMIT 1",
        [randomUUID()],
      ),
      blocked,
    );
  } finally {
    await guard.rollback();
    guard.release();
  }
  assert.deepEqual(await fingerprint(getPool()), before);
  const restoreMs = Math.round(performance.now() - restoreStarted);
  stage = "verify guarded logical restore path";
  const logicalDatabase = `tc_restore_${runId}`;
  await inspector.query(`CREATE DATABASE \`${logicalDatabase}\``);
  await closePool();
  process.env.DATABASE_URL = sourceUrl.replace(
    "/source_fixture",
    `/${logicalDatabase}`,
  );
  await migrate();
  stage = "decode logical archive";
  const decoded = await readSnapshot(openBackup(logicalEncrypted, key));
  await assert.rejects(() =>
    restoreSnapshot(getPool(), decoded, "source_fixture"),
  );
  stage = "restore logical archive";
  await restoreSnapshot(getPool(), decoded, logicalDatabase);
  stage = "fingerprint logical archive";
  assert.deepEqual(
    snapshotFingerprint(await captureSnapshot(getPool())),
    snapshotFingerprint(logicalSnapshot),
  );
  await assert.rejects(() =>
    restoreSnapshot(getPool(), decoded, logicalDatabase),
  );
  stage = "discard logical restored authority";
  const authority = await discardRestoredAuthority(getPool(), logicalDatabase);
  assert.equal(authority.discardedRestoredSessions, 1);
  stage = "restore logical maintenance";
  const maintenanceRestored = await restoreMaintenance(
    getPool(),
    logicalDatabase,
  );
  assert.deepEqual(maintenanceRestored, { triggers: 2, enabledEvents: 2 });
  await migrate();
  // Exercise an actual server-enforced aggregate cap across independent pools.
  const limitedPassword = randomBytes(32).toString("hex");
  stage = "measure aggregate connection cap";
  await inspector.query(
    `CREATE USER 'capacity_fixture'@'%' IDENTIFIED BY '${limitedPassword}' WITH MAX_USER_CONNECTIONS 4`,
  );
  const pools = Array.from({ length: 3 }, () =>
    createPool({
      host: "127.0.0.1",
      port,
      user: "capacity_fixture",
      password: limitedPassword,
      connectionLimit: 2,
      waitForConnections: false,
    }),
  );
  const capacityStarted = performance.now();
  let accepted = 0,
    rejected = 0;
  const held: Awaited<ReturnType<Pool["getConnection"]>>[] = [];
  try {
    const results = await Promise.allSettled(
      pools.flatMap((pool) => [pool.getConnection(), pool.getConnection()]),
    );
    for (const result of results) {
      if (result.status === "fulfilled") {
        held.push(result.value);
        accepted++;
      } else {
        assert.ok(
          ["ER_TOO_MANY_USER_CONNECTIONS", "ER_USER_LIMIT_REACHED"].includes(
            result.reason.code,
          ),
          "the server must reject with a user connection limit code",
        );
        rejected++;
      }
    }
    assert.equal(accepted, 4);
    assert.equal(rejected, 2);
  } finally {
    held.forEach((connection) => connection.release());
    await Promise.all(pools.map((pool) => pool.end()));
  }
  const report = {
    completedAt: new Date().toISOString(),
    scope: "disposable local fixture only",
    source: before,
    encryptedBytes: encrypted.length,
    backupMs,
    restoreMs,
    capacity: {
      independentPools: 3,
      connectionsPerPool: 2,
      serverUserCap: 4,
      accepted,
      rejected,
      elapsedMs: Math.round(performance.now() - capacityStarted),
    },
    elapsedMs: Math.round(performance.now() - started),
    checks: [
      "all table/row fingerprints",
      "migration checksums",
      "restored execution guards",
      "restored counter expiry events",
      "archived receipt recovery",
      "journal balance",
      "wallet balances",
      "position basis/realized",
      "wrong key rejected",
      "tampering rejected",
      "aggregate connection cap",
      "guarded logical archive restore and foreign keys",
      "existing target rejection",
      "restored session authority discarded",
    ],
  };
  await writeFile(
    resolve(folder, "latest-report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} catch (error) {
  console.error(
    JSON.stringify({
      code:
        error && typeof error === "object" && "code" in error
          ? String(error.code)
          : "CHECK_FAILED",
      locations:
        error instanceof Error
          ? error.stack?.match(
              /(?:database-snapshot|rehearse-recovery)\.ts:\d+:\d+/g,
            )
          : [],
      detailsHidden: true,
    }),
  );
  console.error(
    `Recovery rehearsal failed at ${stage}. Disposable fixture only; database statements, credentials and dumps are hidden.`,
  );
  process.exitCode = 1;
} finally {
  await closePool();
  await inspector?.end();
  key.fill(0);
  if (created) {
    // Only this invocation's literal name, never a discovered/computed workspace path.
    try {
      docker(["rm", "--force", "--volumes", container]);
    } catch {
      console.error(`Remove disposable container ${container} manually.`);
      process.exitCode = 1;
    }
  }
  await unlink(envFile).catch(() => {});
  await unlink(backupFile).catch(() => {});
}
