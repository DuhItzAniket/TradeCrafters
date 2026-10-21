import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { createPool } from "mysql2/promise";
import { databaseConfiguration } from "@tradecrafters/database/pool";
import {
  captureSnapshot,
  snapshotBytes,
  snapshotFingerprint,
} from "./operations/database-snapshot";
import { openBackup, sealBackup } from "./operations/backup-envelope";

// Operator-only command. The web build neither imports this file nor receives
// backup credentials/keys. Output is ciphertext and aggregate metadata only.
let pool: ReturnType<typeof createPool> | undefined;
let key: Buffer | undefined;
try {
  const config = databaseConfiguration();
  assert.equal(config.database, process.env.BACKUP_EXPECTED_DATABASE);
  assert.ok(config.ssl, "Hosted backup requires verified TLS.");
  assert.equal(process.env.MYSQL_POOL_SIZE, "1");
  const keyPath = resolve(process.env.BACKUP_KEY_FILE || "");
  const folder = resolve(process.env.BACKUP_DIRECTORY || "");
  assert.ok(process.env.BACKUP_KEY_FILE && process.env.BACKUP_DIRECTORY);
  assert.ok(
    !keyPath.startsWith(folder + "/") && !keyPath.startsWith(folder + "\\"),
    "Keep the key outside the backup directory.",
  );
  const raw = (await readFile(keyPath, "utf8")).trim();
  assert.match(raw, /^[a-f0-9]{64}$/);
  key = Buffer.from(raw, "hex");
  pool = createPool({ ...config, connectionLimit: 1 });
  const snapshot = await captureSnapshot(pool);
  const bytes = sealBackup(snapshotBytes(snapshot), key);
  const id = `${snapshot.capturedAt.replace(/[:.]/g, "-")}-${randomUUID()}`;
  await mkdir(folder, { recursive: true });
  const file = resolve(folder, `${id}.tcbackup`);
  await writeFile(file, bytes, { mode: 0o600, flag: "wx" });
  const retained = await readFile(file);
  assert.deepEqual(openBackup(retained, key), snapshotBytes(snapshot));
  const report = {
    capturedAt: snapshot.capturedAt,
    verifiedAt: new Date().toISOString(),
    archive: `${id}.tcbackup`,
    encryptedBytes: retained.length,
    fingerprint: snapshotFingerprint(snapshot),
    scope: "encrypted hosted logical snapshot; private identity data inside",
    requiresSeparateAuthSecretCustody: true,
  };
  await writeFile(
    resolve(folder, `${id}.json`),
    JSON.stringify(report, null, 2) + "\n",
    { flag: "wx" },
  );
  console.log(JSON.stringify(report));
} catch {
  console.error(
    "Backup failed. Credentials, private records and driver details hidden; inspect the private operator configuration.",
  );
  process.exitCode = 1;
} finally {
  key?.fill(0);
  await pool?.end();
}
