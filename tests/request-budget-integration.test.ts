import { test, beforeEach, afterEach, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { getPool, closePool } from "@tradecrafters/database";
import { consumeRequestBudget } from "@tradecrafters/database/request-budget";
import {
  ingressDigest,
  ingressPolicies,
  IngressUnavailable,
  RequestLimited,
  type IngressScope,
} from "@tradecrafters/database/ingress";

const base = process.env.BETTER_AUTH_URL!;
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
assert.equal(process.env.AUTH_DEV_CREDENTIALS, "true");
const pool = getPool(),
  secret = process.env.BETTER_AUTH_SECRET!;
let controls: RowDataPacket[], clients: RowDataPacket[];
beforeEach(async () => {
  // Only the isolated local admission fixture is reset. Owner accounts, auth,
  // journals and balances are never reset by these tests.
  [controls] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM ingress_budget_control",
  );
  [clients] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM ingress_budget_clients",
  );
  await pool.query("DELETE FROM ingress_budget_clients");
  await pool.query(
    "UPDATE ingress_budget_control SET window_id=FLOOR(UNIX_TIMESTAMP()/60)+1,hits=0",
  );
});
afterEach(async () => {
  await pool.query("DELETE FROM ingress_budget_clients");
  for (const row of controls)
    await pool.execute(
      "INSERT INTO ingress_budget_control (scope,window_id,hits) VALUES (?,?,?) ON DUPLICATE KEY UPDATE window_id=?,hits=?",
      [row.scope, row.window_id, row.hits, row.window_id, row.hits],
    );
  for (const row of clients)
    await pool.execute(
      "INSERT INTO ingress_budget_clients (scope,window_id,subject_digest,hits) VALUES (?,?,?,?)",
      [row.scope, row.window_id, row.subject_digest, row.hits],
    );
});
after(closePool);

async function control(scope: IngressScope) {
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT window_id,hits FROM ingress_budget_control WHERE scope=?",
    [scope],
  );
  return rows[0];
}
async function exhaust(scope: IngressScope, ip: string) {
  const { window_id } = await control(scope);
  await pool.execute("INSERT INTO ingress_budget_clients VALUES (?,?,?,?)", [
    scope,
    window_id,
    ingressDigest(secret, scope, Number(window_id), ip),
    ingressPolicies[scope].perNetwork,
  ]);
}
async function burst(total: number, run: (i: number) => Promise<unknown>) {
  let next = 0;
  const outcomes: PromiseSettledResult<unknown>[] = [];
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      while (next < total) {
        const i = next++;
        try {
          outcomes[i] = { status: "fulfilled", value: await run(i) };
        } catch (reason) {
          outcomes[i] = { status: "rejected", reason };
        }
      }
    }),
  );
  return outcomes;
}
test("concurrent workers share one network allowance and rejected requests do not burn global capacity", async () => {
  const outcomes = await burst(72, () =>
    consumeRequestBudget("write", "198.51.100.1", secret),
  );
  assert.equal(outcomes.filter((x) => x.status === "fulfilled").length, 60);
  assert.ok(
    outcomes
      .filter((x) => x.status === "rejected")
      .every((x) => x.reason instanceof RequestLimited),
  );
  assert.equal(Number((await control("write")).hits), 60);
  await consumeRequestBudget("write", "198.51.100.2", secret);
  assert.equal(Number((await control("write")).hits), 61);
});
test("rotating subjects cannot bypass the shared global ceiling or grow rows after rejection", async () => {
  const outcomes = await burst(144, (i) =>
    consumeRequestBudget("auth", `198.51.100.${i + 1}`, secret),
  );
  assert.equal(outcomes.filter((x) => x.status === "fulfilled").length, 120);
  assert.ok(
    outcomes
      .filter((x) => x.status === "rejected")
      .every((x) => x.reason instanceof RequestLimited),
  );
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT COUNT(*) AS total FROM ingress_budget_clients WHERE scope='auth'",
  );
  assert.equal(Number(rows[0].total), 120);
  assert.equal(Number((await control("auth")).hits), 120);
});
test("database-clock rollover resets admission and removes counters older than the preceding minute", async () => {
  const [clock] = await pool.query<RowDataPacket[]>(
    "SELECT FLOOR(UNIX_TIMESTAMP()/60) AS window_id",
  );
  const current = Number(clock[0].window_id);
  await pool.query(
    "UPDATE ingress_budget_control SET window_id=?,hits=600 WHERE scope='read'",
    [current - 1],
  );
  await pool.execute(
    "INSERT INTO ingress_budget_clients VALUES ('read',?,?,1),('read',?,?,1)",
    [current - 3, "a".repeat(64), current - 1, "b".repeat(64)],
  );
  await consumeRequestBudget("read", "198.51.100.3", secret);
  assert.equal(Number((await control("read")).hits), 1);
  const [old] = await pool.query<RowDataPacket[]>(
    "SELECT COUNT(*) AS total FROM ingress_budget_clients WHERE window_id<?",
    [current - 1],
  );
  assert.equal(Number(old[0].total), 0);
});
test("a full retained-counter bound fails closed without allocating another subject", async () => {
  const { window_id } = await control("read"),
    cap = ingressPolicies.read.global * 2 + 1;
  const values = Array.from({ length: cap }, (_, i) => [
    "read",
    window_id,
    createHash("sha256").update(String(i)).digest("hex"),
    1,
  ]);
  await pool.query(
    "INSERT INTO ingress_budget_clients (scope,window_id,subject_digest,hits) VALUES ?",
    [values],
  );
  await assert.rejects(
    consumeRequestBudget("read", "203.0.113.1", secret),
    IngressUnavailable,
  );
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT COUNT(*) AS total FROM ingress_budget_clients WHERE scope='read'",
  );
  assert.equal(Number(rows[0].total), cap);
  assert.equal(Number((await control("read")).hits), 0);
});
test("HTTP reads and SSR/RSC renders share admission, with a safe retry page and no render double charge", async () => {
  const ip = "198.51.100.20",
    headers = { "x-forwarded-for": ip };
  await exhaust("read", ip);
  for (const path of [
    "/api/directory?page=-1",
    "/api/account",
    "/api/listings/sim-xlon-atlas/chart",
  ]) {
    const response = await fetch(base + path, { headers });
    assert.equal(response.status, 429);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.ok(Number(response.headers.get("retry-after")) >= 1);
    assert.equal((await response.json()).error.code, "RATE_LIMITED");
  }
  assert.equal(
    (await fetch(base + "/api/directory", { method: "HEAD", headers })).status,
    429,
  );
  const limitedPage = await fetch(base + "/directory", { headers });
  assert.equal(limitedPage.status, 429);
  assert.match(await limitedPage.text(), /A moment to catch up/);
  const fresh = { "x-forwarded-for": "198.51.100.21" };
  const start = Number((await control("read")).hits);
  const page = await fetch(base + "/directory", { headers: fresh });
  assert.equal(page.status, 200);
  assert.match(await page.text(), /TradeCrafters/);
  assert.equal(Number((await control("read")).hits) - start, 1);
  const rsc = await fetch(base + "/directory?_rsc=admission-fixture", {
    headers: { ...fresh, RSC: "1" },
  });
  assert.equal(rsc.status, 200);
  await rsc.text();
  assert.equal(Number((await control("read")).hits) - start, 2);
});
test("auth and write requests have separate budgets; liveness and the retry page stay database-free", async () => {
  const ip = "198.51.100.30",
    headers = { "x-forwarded-for": ip };
  await exhaust("auth", ip);
  await exhaust("write", ip);
  assert.equal(
    (await fetch(base + "/api/auth/get-session", { headers })).status,
    429,
  );
  assert.equal(
    (await fetch(base + "/api/account", { method: "POST", headers })).status,
    429,
  );
  assert.equal(
    (await fetch(base + "/api/directory?page=-1", { headers })).status,
    400,
  );
  const before = await Promise.all([
    control("read"),
    control("auth"),
    control("write"),
  ]);
  assert.equal((await fetch(base + "/api/health", { headers })).status, 200);
  assert.equal(
    (await fetch(base + "/request-status?reason=unavailable", { headers }))
      .status,
    503,
  );
  assert.deepEqual(
    await Promise.all([control("read"), control("auth"), control("write")]),
    before,
  );
});
test("a missing control row and bounded lock contention fail closed, then recover without changing connection defaults", async () => {
  await pool.query("DELETE FROM ingress_budget_control WHERE scope='read'");
  await assert.rejects(
    consumeRequestBudget("read", "198.51.100.40", secret),
    IngressUnavailable,
  );
  await pool.query(
    "INSERT INTO ingress_budget_control (scope) VALUES ('read')",
  );
  const held = await pool.getConnection();
  try {
    await held.beginTransaction();
    await held.query(
      "SELECT * FROM ingress_budget_control WHERE scope='read' FOR UPDATE",
    );
    const start = performance.now();
    await assert.rejects(
      consumeRequestBudget("read", "198.51.100.40", secret),
      IngressUnavailable,
    );
    assert.ok(performance.now() - start < 12000);
  } finally {
    await held.rollback();
    held.release();
  }
  await consumeRequestBudget("read", "198.51.100.40", secret);
  assert.equal(Number((await control("read")).hits), 1);
  const connections = await Promise.all(
    Array.from({ length: Number(process.env.MYSQL_POOL_SIZE || 5) }, () =>
      pool.getConnection(),
    ),
  );
  try {
    for (const connection of connections) {
      const [settings] = await connection.query<RowDataPacket[]>(
        "SELECT @@session.innodb_lock_wait_timeout AS seconds,@@session.transaction_isolation AS isolation_level",
      );
      assert.equal(Number(settings[0].seconds), 50);
      assert.equal(settings[0].isolation_level, "REPEATABLE-READ");
    }
  } finally {
    connections.forEach((connection) => connection.release());
  }
});
test(
  "database events expire idle ingress and auth rows without an application request",
  { timeout: 85000 },
  async () => {
    const id = randomUUID(),
      digest = "e".repeat(64);
    await pool.query(
      "INSERT INTO ingress_budget_clients VALUES ('read',0,?,1)",
      [digest],
    );
    await pool.execute(
      "INSERT INTO rateLimit (id,`key`,count,lastRequest) VALUES (?,?,1,0)",
      [id, `expiry-fixture-${id}`],
    );
    try {
      let expired = false;
      for (let i = 0; i < 38; i++) {
        const [rows] = await pool.query<RowDataPacket[]>(
          "SELECT (SELECT COUNT(*) FROM ingress_budget_clients WHERE window_id=0 AND subject_digest=?) + (SELECT COUNT(*) FROM rateLimit WHERE id=?) AS total",
          [digest, id],
        );
        if (Number(rows[0].total) === 0) {
          expired = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      assert.equal(
        expired,
        true,
        "idle expiry must not depend on subsequent HTTP traffic",
      );
      const [events] = await pool.query<RowDataPacket[]>(
        "SELECT EVENT_NAME,STATUS,LAST_EXECUTED FROM information_schema.events WHERE event_schema=DATABASE() AND EVENT_NAME IN ('ingress_counter_expiry','auth_counter_expiry')",
      );
      assert.equal(events.length, 2);
      assert.ok(
        events.every(
          (event) => event.STATUS === "ENABLED" && event.LAST_EXECUTED,
        ),
      );
    } finally {
      await pool.execute("DELETE FROM rateLimit WHERE id=?", [id]);
      await pool.execute(
        "DELETE FROM ingress_budget_clients WHERE window_id=0 AND subject_digest=?",
        [digest],
      );
    }
  },
);
