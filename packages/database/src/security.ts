import { createHmac } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "./pool";

export async function securityState(userId: string, sessionId: string) {
  const [rows] = await getPool().execute<RowDataPacket[]>(
    "SELECT u.twoFactorEnabled, EXISTS(SELECT 1 FROM admin_roles r WHERE r.user_id = u.id) AS is_admin, EXISTS(SELECT 1 FROM account a WHERE a.userId = u.id AND a.providerId = 'credential') AS has_password, (SELECT expires_at FROM mfa_stepups m WHERE m.session_id = ? AND m.expires_at > UTC_TIMESTAMP(3)) AS stepup_expires_at FROM user u WHERE u.id = ?",
    [sessionId, userId],
  );
  const row = rows[0];
  return {
    mfaEnabled: Number(row.twoFactorEnabled) === 1,
    isAdmin: Number(row.is_admin) === 1,
    hasPassword: Number(row.has_password) === 1,
    stepUpExpiresAt: row.stepup_expires_at
      ? new Date(row.stepup_expires_at).toISOString()
      : null,
  };
}

export async function consumeMfaBudget(userId: string) {
  const window = Math.floor(Date.now() / 60000);
  await getPool().execute(
    "INSERT INTO mfa_attempt_budgets (user_id, window_id, hits) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE hits = IF(window_id = VALUES(window_id), hits + 1, 1), window_id = VALUES(window_id)",
    [userId, window],
  );
  const [rows] = await getPool().execute<RowDataPacket[]>(
    "SELECT hits FROM mfa_attempt_budgets WHERE user_id = ?",
    [userId],
  );
  return Number(rows[0].hits) <= 5;
}

export async function clearStepUps(userId: string) {
  await getPool().execute(
    "DELETE m FROM mfa_stepups m JOIN session s ON s.id = m.session_id WHERE s.userId = ?",
    [userId],
  );
}

export async function recordStepUp(
  userId: string,
  sessionId: string,
  code: string,
  secret: string,
) {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute("SELECT id FROM user WHERE id = ? FOR UPDATE", [
      userId,
    ]);
    const [sessions] = await connection.execute<RowDataPacket[]>(
      "SELECT id FROM session WHERE id = ? AND userId = ? AND expiresAt > UTC_TIMESTAMP(3) FOR UPDATE",
      [sessionId, userId],
    );
    if (!sessions.length) throw new Error("SESSION_REVOKED");
    const digest = createHmac("sha256", secret)
      .update(`stepup:${userId}:${code}`)
      .digest("hex");
    await connection.execute(
      "DELETE FROM mfa_used_codes WHERE user_id = ? AND expires_at <= UTC_TIMESTAMP(3)",
      [userId],
    );
    const [used] = await connection.execute<RowDataPacket[]>(
      "SELECT code_digest FROM mfa_used_codes WHERE user_id = ? AND code_digest = ?",
      [userId, digest],
    );
    if (used.length) {
      await connection.rollback();
      return false;
    }
    await connection.execute(
      "INSERT INTO mfa_used_codes (user_id, code_digest, expires_at) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 90 SECOND))",
      [userId, digest],
    );
    await connection.execute(
      "INSERT INTO mfa_stepups (session_id, expires_at) VALUES (?, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 5 MINUTE)) ON DUPLICATE KEY UPDATE expires_at = VALUES(expires_at)",
      [sessionId],
    );
    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function manageAdmin(
  userId: string,
  action: "grant" | "revoke",
  reason: string,
) {
  if (
    !/^[a-zA-Z0-9_-]{1,36}$/.test(userId) ||
    reason.trim().length < 10 ||
    reason.length > 300
  )
    throw new Error("Supply a valid user ID and a 10–300 character reason.");
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [users] = await connection.execute<RowDataPacket[]>(
      "SELECT u.emailVerified, u.twoFactorEnabled, EXISTS(SELECT 1 FROM twoFactor t WHERE t.userId = u.id AND t.verified = true) AS verified_factor FROM user u WHERE u.id = ? FOR UPDATE",
      [userId],
    );
    const user = users[0];
    if (!user) throw new Error("USER_NOT_FOUND");
    if (
      action === "grant" &&
      (Number(user.emailVerified) !== 1 ||
        Number(user.twoFactorEnabled) !== 1 ||
        Number(user.verified_factor) !== 1)
    )
      throw new Error(
        "Admin grants require a verified identity and an enrolled, verified authenticator.",
      );
    if (action === "grant")
      await connection.execute(
        "INSERT INTO admin_roles (user_id) VALUES (?) ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)",
        [userId],
      );
    else {
      await connection.execute(
        "DELETE m FROM mfa_stepups m JOIN session s ON s.id = m.session_id WHERE s.userId = ?",
        [userId],
      );
      await connection.execute("DELETE FROM admin_roles WHERE user_id = ?", [
        userId,
      ]);
    }
    await connection.execute(
      "INSERT INTO security_audit (actor_user_id, subject_user_id, action, reason, source) VALUES (NULL, ?, ?, ?, 'operator-cli')",
      [userId, `admin_${action}`, reason.trim()],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function simulationControl() {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT paused, updated_at FROM simulation_control WHERE id = 1",
  );
  return {
    paused: Number(rows[0].paused) === 1,
    updatedAt: new Date(rows[0].updated_at).toISOString(),
  };
}
export async function updateSimulationControl(
  userId: string,
  sessionId: string,
  paused: boolean,
  reason: string,
) {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      "SELECT id FROM simulation_control WHERE id = 1 FOR UPDATE",
    );
    await connection.execute("SELECT id FROM user WHERE id = ? FOR UPDATE", [
      userId,
    ]);
    // Recheck authorization inside the write transaction; an HTTP precheck is not enough.
    const [roles] = await connection.execute<RowDataPacket[]>(
      "SELECT user_id FROM admin_roles WHERE user_id = ? FOR SHARE",
      [userId],
    );
    const [proof] = await connection.execute<RowDataPacket[]>(
      "SELECT s.id FROM session s JOIN user u ON u.id = s.userId JOIN mfa_stepups m ON m.session_id = s.id WHERE s.id = ? AND s.userId = ? AND s.expiresAt > UTC_TIMESTAMP(3) AND u.emailVerified = true AND u.twoFactorEnabled = true AND m.expires_at > UTC_TIMESTAMP(3) FOR UPDATE",
      [sessionId, userId],
    );
    if (!roles.length || !proof.length) {
      await connection.rollback();
      return false;
    }
    await connection.execute(
      "UPDATE simulation_control SET paused = ?, updated_at = UTC_TIMESTAMP(3) WHERE id = 1",
      [paused],
    );
    await connection.execute(
      "INSERT INTO security_audit (actor_user_id, subject_user_id, action, reason, source) VALUES (?, ?, ?, ?, 'admin-session')",
      [
        userId,
        userId,
        paused ? "simulation_pause" : "simulation_resume",
        reason,
      ],
    );
    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
export class SimulationPausedError extends Error {
  constructor() {
    super(
      "New simulation funding is temporarily paused. Please try again later.",
    );
  }
}
export async function auditSummary() {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT action, reason, source, created_at AS createdAt FROM security_audit ORDER BY id DESC LIMIT 20",
  );
  return rows;
}
