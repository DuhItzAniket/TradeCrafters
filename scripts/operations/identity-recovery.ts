import assert from "node:assert/strict";
import type { Pool, RowDataPacket } from "mysql2/promise";

// Operator-only database operation. There is no HTTP endpoint/import from the
// app. The CLI independently verifies repository-owner control before calling
// this function; database email/name/session claims are insufficient proof.
export async function recoverOwnerIdentity(
  pool: Pool,
  input: { userId: string; githubId: string; caseKey: string },
) {
  assert.match(input.userId, /^[a-zA-Z0-9_-]{1,36}$/);
  assert.match(input.githubId, /^[1-9][0-9]{0,19}$/);
  assert.match(
    input.caseKey,
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
  );
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [users] = await connection.execute<RowDataPacket[]>(
      "SELECT id,emailVerified FROM user WHERE id=? FOR UPDATE",
      [input.userId],
    );
    assert.equal(users.length, 1);
    assert.equal(Number(users[0].emailVerified), 1);
    const [owners] = await connection.execute<RowDataPacket[]>(
      "SELECT userId FROM account WHERE providerId='github' AND accountId=? FOR UPDATE",
      [input.githubId],
    );
    assert.equal(owners.length, 1, "Provider mapping must be unambiguous.");
    assert.equal(owners[0].userId, input.userId);
    const [previous] = await connection.execute<RowDataPacket[]>(
      "SELECT action,subject_user_id FROM security_audit WHERE case_key=?",
      [input.caseKey],
    );
    if (previous.length) {
      assert.equal(previous[0].action, "identity_recovery");
      assert.equal(previous[0].subject_user_id, input.userId);
      await connection.commit();
      // A lost response must not reset a subsequently enrolled new factor.
      return { completed: true, replayed: true };
    }
    const [sessions] = await connection.execute<RowDataPacket[]>(
      "SELECT COUNT(*) AS n FROM session WHERE userId=?",
      [input.userId],
    );
    await connection.execute("DELETE FROM admin_roles WHERE user_id=?", [
      input.userId,
    ]);
    await connection.execute(
      "DELETE m FROM mfa_stepups m JOIN session s ON s.id=m.session_id WHERE s.userId=?",
      [input.userId],
    );
    await connection.execute("DELETE FROM session WHERE userId=?", [
      input.userId,
    ]);
    // SDK 1.7.11 stores trust-device and pending 2FA authority with value=userId.
    // Remove paired pending-attempt rows too; never clear another user's state.
    const [authority] = await connection.execute<RowDataPacket[]>(
      "SELECT identifier FROM verification WHERE value=? FOR UPDATE",
      [input.userId],
    );
    await connection.execute("DELETE FROM verification WHERE value=?", [
      input.userId,
    ]);
    for (const item of authority)
      await connection.execute("DELETE FROM verification WHERE identifier=?", [
        `2fa-attempts-${item.identifier}`,
      ]);
    await connection.execute("DELETE FROM twoFactor WHERE userId=?", [
      input.userId,
    ]);
    await connection.execute("DELETE FROM mfa_used_codes WHERE user_id=?", [
      input.userId,
    ]);
    await connection.execute(
      "DELETE FROM mfa_attempt_budgets WHERE user_id=?",
      [input.userId],
    );
    await connection.execute(
      "UPDATE user SET twoFactorEnabled=false,updatedAt=UTC_TIMESTAMP(3) WHERE id=?",
      [input.userId],
    );
    await connection.execute(
      "INSERT INTO security_audit (actor_user_id,subject_user_id,action,reason,source,case_key) VALUES (NULL,?,'identity_recovery','Repository-owner recovery: independent provider and infrastructure control checked; sessions, role and factor revoked.','operator-cli',?)",
      [input.userId, input.caseKey],
    );
    await connection.commit();
    return {
      completed: true,
      replayed: false,
      revokedSessions: Number(sessions[0].n),
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
