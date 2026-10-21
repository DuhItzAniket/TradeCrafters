import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { createConnection, type RowDataPacket } from "mysql2/promise";
import { getPool, closePool } from "@tradecrafters/database";

const url = new URL(process.env.DATABASE_URL!);
if (
  process.env.AUTH_DEV_CREDENTIALS !== "true" ||
  !["127.0.0.1", "localhost"].includes(url.hostname)
)
  throw Error("LOCAL_TEST_ONLY");

// Exercise the real pool and SDK event registration in an isolated process.
// The runtime context is the only simulated boundary; MySQL connections are real.
process.env.NODE_ENV = "production";
process.env.MYSQL_POOL_SIZE = "1";
process.env.VERCEL = "1";
process.env.VERCEL_URL = "fixture.example.test";
process.env.VERCEL_REGION = "fixture";
const pending: Promise<unknown>[] = [];
Object.defineProperty(globalThis, Symbol.for("@vercel/request-context"), {
  value: {
    get: () => ({
      waitUntil: (promise: Promise<unknown>) => pending.push(promise),
    }),
  },
  configurable: true,
});

let observer;
let held:
  Awaited<ReturnType<ReturnType<typeof getPool>["getConnection"]>> | undefined;
try {
  observer = await createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
  });
  const pool = getPool();
  held = await pool.getConnection();
  const [initial] = await held.query<RowDataPacket[]>(
    "SELECT CONNECTION_ID() AS id, @@session.wait_timeout AS idleCeiling",
  );
  assert.equal(Number(initial[0].idleCeiling), 60);
  await delay(6200);
  const [stillHeld] = await held.query<RowDataPacket[]>(
    "SELECT CONNECTION_ID() AS id",
  );
  assert.equal(
    stillHeld[0].id,
    initial[0].id,
    "idle reaping must not kill checked-out work",
  );
  held.release();
  held = undefined;
  assert.ok(
    pending.length > 0,
    "the actual SDK must register its release wait",
  );
  await Promise.all(pending);
  const [remaining] = await observer.query<RowDataPacket[]>(
    "SELECT COUNT(*) AS count FROM information_schema.PROCESSLIST WHERE ID=?",
    [initial[0].id],
  );
  assert.equal(
    Number(remaining[0].count),
    0,
    "idle socket must be gone before suspension wait resolves",
  );
  const next = await pool.getConnection();
  try {
    const [reopened] = await next.query<RowDataPacket[]>(
      "SELECT CONNECTION_ID() AS id",
    );
    assert.notEqual(
      reopened[0].id,
      initial[0].id,
      "the pool must reconnect after draining",
    );
  } finally {
    next.release();
  }
  await Promise.all(pending);
  console.log(
    "Pool lifecycle verified: checked-out connection retained, idle drained before suspension, reconnect succeeded.",
  );
} catch {
  console.error(
    "Pool lifecycle fixture failed; credentials and driver details hidden.",
  );
  process.exitCode = 1;
} finally {
  held?.release();
  await closePool();
  await observer?.end();
}
