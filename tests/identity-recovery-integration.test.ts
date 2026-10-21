import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { serializeSignedCookie } from "better-call";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import { getPool, closePool } from "@tradecrafters/database";
import { getAuth } from "@tradecrafters/database/auth";
import { simulationControl } from "@tradecrafters/database/security";
import { recoverOwnerIdentity } from "../scripts/operations/identity-recovery";
import { fixtureSql } from "./fixtures/mysql-operator";
const createdFixtures: { userId: string; email: string }[] = [];
after(async () => {
  try {
    for (const { userId, email } of createdFixtures) {
      const [accounts] = await getPool().execute<RowDataPacket[]>(
        "SELECT COUNT(*) AS n FROM simulation_accounts WHERE user_id=?",
        [userId],
      );
      assert.equal(Number(accounts[0].n), 0);
      const [authority] = await getPool().execute<RowDataPacket[]>(
        "SELECT identifier FROM verification WHERE value=?",
        [userId],
      );
      for (const item of authority)
        await getPool().execute("DELETE FROM verification WHERE identifier=?", [
          `2fa-attempts-${item.identifier}`,
        ]);
      await getPool().execute("DELETE FROM verification WHERE value=?", [
        userId,
      ]);
      await getPool().execute("DELETE FROM mutation_budgets WHERE user_id=?", [
        userId,
      ]);
      await getPool().execute(
        "DELETE FROM security_audit WHERE subject_user_id=?",
        [userId],
      );
      await getPool().execute("DELETE FROM user WHERE id=? AND email=?", [
        userId,
        email,
      ]);
    }
  } finally {
    await closePool();
  }
});
const base = process.env.BETTER_AUTH_URL || "http://127.0.0.1:3000";

async function fixture() {
  assert.equal(process.env.AUTH_DEV_CREDENTIALS, "true");
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
  assert.ok(
    ["localhost", "127.0.0.1"].includes(
      new URL(process.env.DATABASE_URL!).hostname,
    ),
  );
  const userId = randomUUID(),
    githubId = `9${Date.now()}${Math.floor(Math.random() * 1000)}`,
    caseKey = randomUUID();
  createdFixtures.push({
    userId,
    email: `recovery-test-${userId}@example.invalid`,
  });
  // Explicit local authority fixtures, never a real GitHub identity/factor.
  await getPool().execute(
    "INSERT INTO user (id,name,email,emailVerified,twoFactorEnabled) VALUES (?,'Isolated recovery fixture',?,true,true)",
    [userId, `recovery-test-${userId}@example.invalid`],
  );
  await getPool().execute(
    "INSERT INTO account (id,accountId,providerId,userId,updatedAt) VALUES (?,?,'github',?,UTC_TIMESTAMP(3))",
    [randomUUID(), githubId, userId],
  );
  await getPool().execute(
    "INSERT INTO twoFactor (id,userId,secret,backupCodes,verified) VALUES (?,?,?,'[]',true)",
    [randomUUID(), userId, "fixture-only-factor"],
  );
  await getPool().execute("INSERT INTO admin_roles (user_id) VALUES (?)", [
    userId,
  ]);
  const context = await getAuth().$context;
  const issue = async () => {
    const session = await context.internalAdapter.createSession(userId, false);
    assert.ok(session);
    const cookie = await serializeSignedCookie(
      context.authCookies.sessionToken.name,
      session.token,
      context.secret,
      context.authCookies.sessionToken.attributes,
    );
    await getPool().execute(
      "INSERT INTO mfa_stepups (session_id,expires_at) VALUES (?,UTC_TIMESTAMP(3)+INTERVAL 5 MINUTE)",
      [session.id],
    );
    return { cookie: cookie.split(";")[0], id: session.id };
  };
  const session = await issue();
  const trust = `trust-device-${randomUUID()}`,
    pending = `2fa-${randomUUID()}`;
  for (const identifier of [trust, pending])
    await getPool().execute(
      "INSERT INTO verification (id,identifier,value,expiresAt) VALUES (?,?,?,UTC_TIMESTAMP(3)+INTERVAL 1 DAY)",
      [randomUUID(), identifier, userId],
    );
  await getPool().execute(
    "INSERT INTO verification (id,identifier,value,expiresAt) VALUES (?,?,'0',UTC_TIMESTAMP(3)+INTERVAL 1 DAY)",
    [randomUUID(), `2fa-attempts-${pending}`],
  );
  const network = `2001:db8:${userId.slice(0, 4)}:1::1`;
  const request = (path: string, body?: unknown, cookie = session.cookie) =>
    fetch(base + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Cookie: cookie,
        "X-Forwarded-For": network,
        ...(body === undefined
          ? {}
          : { Origin: base, "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const cleanup = async () => {
    const [accounts] = await getPool().execute<RowDataPacket[]>(
      "SELECT COUNT(*) AS n FROM simulation_accounts WHERE user_id=?",
      [userId],
    );
    assert.equal(Number(accounts[0].n), 0);
    await getPool().execute(
      "DELETE FROM verification WHERE value=? OR identifier=?",
      [userId, `2fa-attempts-${pending}`],
    );
    await getPool().execute(
      "DELETE FROM security_audit WHERE subject_user_id=?",
      [userId],
    );
    await getPool().execute("DELETE FROM mutation_budgets WHERE user_id=?", [
      userId,
    ]);
    await getPool().execute("DELETE FROM user WHERE id=? AND email=?", [
      userId,
      `recovery-test-${userId}@example.invalid`,
    ]);
  };
  return {
    input: { userId, githubId, caseKey },
    session,
    issue,
    request,
    cleanup,
    trust,
    pending,
  };
}

test("operator recovery revokes only the matched subject and replay cannot reset a newly enrolled factor", async () => {
  const a = await fixture(),
    b = await fixture();
  try {
    assert.equal((await a.request("/api/admin/control")).status, 200);
    await assert.rejects(() =>
      recoverOwnerIdentity(getPool(), {
        ...a.input,
        githubId: b.input.githubId,
      }),
    );
    assert.equal((await a.request("/api/admin/control")).status, 200);
    const initial = await simulationControl();
    const result = await recoverOwnerIdentity(getPool(), a.input);
    assert.equal(result.replayed, false);
    assert.equal(result.revokedSessions, 1);
    for (const path of [
      "/api/account",
      "/api/security",
      "/api/admin/control",
      "/api/trading/portfolio",
    ])
      assert.equal((await a.request(path)).status, 401);
    assert.equal((await b.request("/api/admin/control")).status, 200);
    const [old] = await getPool().execute<RowDataPacket[]>(
      "SELECT (SELECT COUNT(*) FROM twoFactor WHERE userId=?) AS factors,(SELECT COUNT(*) FROM verification WHERE value=? OR identifier=?) AS authority,(SELECT COUNT(*) FROM admin_roles WHERE user_id=?) AS roles",
      [
        a.input.userId,
        a.input.userId,
        `2fa-attempts-${a.pending}`,
        a.input.userId,
      ],
    );
    assert.deepEqual(Object.values(old[0]).map(Number), [0, 0, 0]);
    // Model a fresh enrollment/session without involving anyone's real device.
    await getPool().execute(
      "UPDATE user SET twoFactorEnabled=true WHERE id=?",
      [a.input.userId],
    );
    await getPool().execute(
      "INSERT INTO twoFactor (id,userId,secret,backupCodes,verified) VALUES (?,?,?,'[]',true)",
      [randomUUID(), a.input.userId, "fixture-new-factor"],
    );
    const fresh = await a.issue();
    assert.equal(
      (await recoverOwnerIdentity(getPool(), a.input)).replayed,
      true,
    );
    assert.equal(
      (await a.request("/api/security", undefined, fresh.cookie)).status,
      200,
    );
    assert.equal(
      (await a.request("/api/admin/control", undefined, fresh.cookie)).status,
      403,
    );
    const [factor] = await getPool().execute<RowDataPacket[]>(
      "SELECT secret FROM twoFactor WHERE userId=?",
      [a.input.userId],
    );
    assert.equal(factor[0].secret, "fixture-new-factor");
    assert.deepEqual(await simulationControl(), initial);
  } finally {
    await a.cleanup();
    await b.cleanup();
  }
});

test("an audit append failure rolls back session, role, factor and trusted-device revocation together", async () => {
  const a = await fixture();
  const faultPool = new Proxy(getPool(), {
    get(target, key) {
      if (key === "getConnection")
        return async () =>
          new Proxy(await target.getConnection(), {
            get(connection, name) {
              if (name === "execute")
                return async (
                  sql: string,
                  values: (string | number | null)[],
                ) => {
                  if (sql.startsWith("INSERT INTO security_audit"))
                    throw Error("fixture audit unavailable");
                  return connection.execute(sql, values);
                };
              const value = Reflect.get(connection, name);
              return typeof value === "function"
                ? value.bind(connection)
                : value;
            },
          });
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as Pool;
  try {
    await assert.rejects(
      () => recoverOwnerIdentity(faultPool, a.input),
      /fixture audit unavailable/,
    );
    assert.equal((await a.request("/api/admin/control")).status, 200);
    const [state] = await getPool().execute<RowDataPacket[]>(
      "SELECT (SELECT COUNT(*) FROM twoFactor WHERE userId=?) AS factors,(SELECT COUNT(*) FROM verification WHERE value=?) AS authority,(SELECT COUNT(*) FROM security_audit WHERE case_key=?) AS audits",
      [a.input.userId, a.input.userId, a.input.caseKey],
    );
    assert.deepEqual(Object.values(state[0]).map(Number), [1, 2, 0]);
  } finally {
    await a.cleanup();
  }
});

test("a privileged write waiting on a control lock is denied after operator recovery commits", async () => {
  const a = await fixture(),
    initial = await simulationControl();
  let blocker: PoolConnection | undefined,
    pending: Promise<Response> | undefined;
  try {
    blocker = await getPool().getConnection();
    await blocker.beginTransaction();
    await blocker.query(
      "SELECT id FROM simulation_control WHERE id=1 FOR UPDATE",
    );
    pending = a.request("/api/admin/control", {
      scope: "execution",
      paused: !initial.executionPaused,
      reason: "Isolated recovery waiting-write fixture",
    });
    let observed = false;
    for (let i = 0; i < 60; i++) {
      const n = Number(
        fixtureSql(
          "SELECT COUNT(*) FROM performance_schema.data_lock_waits w JOIN performance_schema.data_locks l ON l.ENGINE_LOCK_ID=w.REQUESTING_ENGINE_LOCK_ID WHERE l.OBJECT_SCHEMA=DATABASE() AND l.OBJECT_NAME='simulation_control'",
        ),
      );
      if (n > 0) {
        observed = true;
        break;
      }
      await delay(50);
    }
    assert.equal(
      observed,
      true,
      "Observe the real lock wait before revocation.",
    );
    await recoverOwnerIdentity(getPool(), a.input);
    await blocker.rollback();
    blocker.release();
    blocker = undefined;
    assert.equal((await pending).status, 403);
    pending = undefined;
    assert.deepEqual(await simulationControl(), initial);
  } finally {
    if (blocker) {
      await blocker.rollback();
      blocker.release();
    }
    await pending?.catch(() => {});
    const current = await simulationControl();
    if (
      current.paused !== initial.paused ||
      current.executionPaused !== initial.executionPaused
    )
      await getPool().execute(
        "UPDATE simulation_control SET paused=?,execution_paused=? WHERE id=1",
        [initial.paused, initial.executionPaused],
      );
    await a.cleanup();
  }
});
