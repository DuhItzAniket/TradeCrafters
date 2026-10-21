import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { createPool } from "mysql2/promise";
import { databaseConfiguration } from "@tradecrafters/database/pool";
import { captureSnapshot } from "./operations/database-snapshot";
import { openBackup } from "./operations/backup-envelope";
import { compareAuditAnchor } from "./operations/audit-anchor";
let pool: ReturnType<typeof createPool> | undefined, key: Buffer | undefined;
try {
  assert.ok(process.env.AUDIT_ANCHOR_ARCHIVE && process.env.BACKUP_KEY_FILE);
  const config = databaseConfiguration();
  assert.ok(config.ssl);
  assert.equal(config.database, process.env.BACKUP_EXPECTED_DATABASE);
  assert.equal(process.env.MYSQL_POOL_SIZE, "1");
  assert.ok(
    (await stat(process.env.AUDIT_ANCHOR_ARCHIVE!)).size <=
      64 * 1024 * 1024 + 1024,
  );
  const raw = (await readFile(process.env.BACKUP_KEY_FILE!, "utf8")).trim();
  assert.match(raw, /^[a-f0-9]{64}$/);
  key = Buffer.from(raw, "hex");
  const anchor = openBackup(
    await readFile(process.env.AUDIT_ANCHOR_ARCHIVE!),
    key,
  );
  pool = createPool({ ...config, connectionLimit: 1 });
  const result = compareAuditAnchor(anchor, await captureSnapshot(pool));
  console.log(
    JSON.stringify({
      checkedAt: new Date().toISOString(),
      ...result,
      scope:
        "read-only comparison to independently held authenticated archive; not a tamper-proof live database",
    }),
  );
} catch {
  console.error(
    "Audit anchor check failed. Stop export replacement and inspect privately; records and credentials hidden.",
  );
  process.exitCode = 1;
} finally {
  key?.fill(0);
  await pool?.end();
}
