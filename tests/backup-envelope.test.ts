import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { sealBackup, openBackup } from "../scripts/operations/backup-envelope";
test("backup encryption authenticates before returning SQL and rejects wrong keys, truncation and tampering", () => {
  const key = randomBytes(32),
    sql = Buffer.from("fixture SQL with private records"),
    encrypted = sealBackup(sql, key);
  assert.equal(encrypted.includes(sql), false);
  assert.deepEqual(openBackup(encrypted, key), sql);
  assert.notDeepEqual(sealBackup(sql, key), encrypted);
  const damaged = Buffer.from(encrypted);
  damaged[damaged.length - 1] ^= 1;
  for (const bytes of [
    damaged,
    encrypted.subarray(0, 10),
    encrypted.subarray(1),
  ])
    assert.throws(() => openBackup(bytes, key), /authentication failed/);
  assert.throws(
    () => openBackup(encrypted, randomBytes(32)),
    /authentication failed/,
  );
});
