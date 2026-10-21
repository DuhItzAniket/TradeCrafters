import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { recoverOwnerIdentity } from "./identity-recovery";

// This fixture is never an externally verified provider identity. It may run
// only inside a disposable restore target with no public app/runtime grants.
export async function exerciseRecoveryFixture(pool: Pool, database: string) {
  assert.match(database, /^tc_restore_[a-f0-9]{16}$/);
  const [target] = await pool.query<RowDataPacket[]>(
    "SELECT DATABASE() AS name",
  );
  assert.equal(target[0].name, database);
  const balances = async () =>
    (
      await pool.query<RowDataPacket[]>(
        "SELECT (SELECT COUNT(*) FROM simulation_accounts) AS accounts,(SELECT COUNT(*) FROM cash_journals) AS journals,(SELECT COUNT(*) FROM wallets) AS wallets,(SELECT COUNT(*) FROM fills) AS fills,(SELECT COUNT(*) FROM positions) AS positions,(SELECT COUNT(*) FROM operation_records) AS receipts,(SELECT paused FROM simulation_control WHERE id=1) AS funding,(SELECT execution_paused FROM simulation_control WHERE id=1) AS execution",
      )
    )[0][0];
  const before = await balances();
  const fixtures: { userId: string; githubId: string; caseKey: string }[] = [];
  for (const label of ["a", "b"]) {
    const userId = randomUUID(),
      githubId = BigInt(
        "0x" + randomUUID().replaceAll("-", "").slice(0, 16),
      ).toString();
    await pool.execute(
      "INSERT INTO user (id,name,email,emailVerified,twoFactorEnabled) VALUES (?,'Disposable restore recovery fixture',?,true,true)",
      [userId, `recovery-${label}-${userId}@example.invalid`],
    );
    await pool.execute(
      "INSERT INTO account (id,accountId,providerId,userId,updatedAt) VALUES (?,?,'github',?,UTC_TIMESTAMP(3))",
      [randomUUID(), githubId, userId],
    );
    await pool.execute(
      "INSERT INTO twoFactor (id,userId,secret,backupCodes,verified) VALUES (?,?,?,'[]',true)",
      [randomUUID(), userId, "fictional-recovery-factor"],
    );
    await pool.execute("INSERT INTO admin_roles (user_id) VALUES (?)", [
      userId,
    ]);
    const sessionId = randomUUID();
    await pool.execute(
      "INSERT INTO session (id,userId,token,expiresAt,updatedAt) VALUES (?,?,?,UTC_TIMESTAMP(3)+INTERVAL 1 DAY,UTC_TIMESTAMP(3))",
      [sessionId, userId, randomUUID()],
    );
    await pool.execute(
      "INSERT INTO mfa_stepups (session_id,expires_at) VALUES (?,UTC_TIMESTAMP(3)+INTERVAL 5 MINUTE)",
      [sessionId],
    );
    await pool.execute(
      "INSERT INTO verification (id,identifier,value,expiresAt) VALUES (?,?,?,UTC_TIMESTAMP(3)+INTERVAL 1 DAY)",
      [randomUUID(), `trust-device-${randomUUID()}`, userId],
    );
    fixtures.push({ userId, githubId, caseKey: randomUUID() });
  }
  await assert.rejects(() =>
    recoverOwnerIdentity(pool, {
      ...fixtures[0],
      githubId: fixtures[1].githubId,
    }),
  );
  assert.equal((await recoverOwnerIdentity(pool, fixtures[0])).replayed, false);
  const state = async (userId: string) =>
    (
      await pool.execute<RowDataPacket[]>(
        "SELECT (SELECT COUNT(*) FROM session WHERE userId=?) AS sessions,(SELECT COUNT(*) FROM twoFactor WHERE userId=?) AS factors,(SELECT COUNT(*) FROM admin_roles WHERE user_id=?) AS roles,(SELECT COUNT(*) FROM verification WHERE value=?) AS trust",
        [userId, userId, userId, userId],
      )
    )[0][0];
  assert.deepEqual(
    Object.values(await state(fixtures[0].userId)).map(Number),
    [0, 0, 0, 0],
  );
  assert.deepEqual(
    Object.values(await state(fixtures[1].userId)).map(Number),
    [1, 1, 1, 1],
  );
  await pool.execute(
    "INSERT INTO twoFactor (id,userId,secret,backupCodes,verified) VALUES (?,?,?,'[]',true)",
    [randomUUID(), fixtures[0].userId, "fictional-new-factor"],
  );
  await pool.execute("UPDATE user SET twoFactorEnabled=true WHERE id=?", [
    fixtures[0].userId,
  ]);
  await pool.execute(
    "INSERT INTO session (id,userId,token,expiresAt,updatedAt) VALUES (?,?,?,UTC_TIMESTAMP(3)+INTERVAL 1 DAY,UTC_TIMESTAMP(3))",
    [randomUUID(), fixtures[0].userId, randomUUID()],
  );
  assert.equal((await recoverOwnerIdentity(pool, fixtures[0])).replayed, true);
  assert.deepEqual(
    Object.values(await state(fixtures[0].userId)).map(Number),
    [1, 1, 0, 0],
  );
  assert.deepEqual(await balances(), before);
  return {
    matchedProviderRequired: true,
    subjectOnlyRevocation: true,
    replayPreservesNewFactor: true,
    adminAutomaticallyRestored: false,
    financialCountsAndControlsPreserved: true,
    scope:
      "disposable restore identities only; not real provider identity or owner factor reset",
  };
}
