import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { writeFile } from "node:fs/promises";
import { createPool, type PoolConnection } from "mysql2/promise";
import { databaseConfiguration } from "@tradecrafters/database/pool";

// Explicit actual-service rehearsal: hold ONLY this invocation's connections,
// never kill application connections, raise caps, change flags or write data.
assert.equal(process.argv[2], "--briefly-exercise-hosted-ceiling");
const origin = "https://tradecrafters-preview-gamma.vercel.app";
const url = new URL(process.env.DATABASE_URL!);
assert.equal(
  url.hostname,
  "tradecrafters-preview-duhitzaniket-tradecrafters.l.aivencloud.com",
);
assert.equal(url.pathname, "/tradecrafters_preview");
assert.equal(url.username, "tc_preview_web");
assert.equal(process.env.BETTER_AUTH_URL, origin);
const config = databaseConfiguration();
assert.ok(config.ssl);
const pool = createPool({
  ...config,
  connectionLimit: 12,
  waitForConnections: false,
});
const held: PoolConnection[] = [];
const report: Record<string, unknown> = {
  startedAt: new Date().toISOString(),
  scope:
    "bounded actual runtime ceiling; no financial writes or owner session access",
};
let timer: ReturnType<typeof setTimeout> | undefined;
try {
  // Let ordinary released serverless sockets reap before the short hold.
  await delay(6000);
  timer = setTimeout(
    () => held.forEach((connection) => connection.destroy()),
    8000,
  );
  const acquired = await Promise.allSettled(
    Array.from({ length: 12 }, () => pool.getConnection()),
  );
  for (const result of acquired)
    if (result.status === "fulfilled") held.push(result.value);
  report.heldConnections = held.length;
  assert.equal(
    held.length,
    12,
    "Another request owns capacity; release and inspect rather than killing it.",
  );
  const health = await fetch(origin + "/api/health", {
    signal: AbortSignal.timeout(4000),
  });
  assert.equal(health.status, 200);
  const results = await Promise.all(
    [
      "/api/directory?page=1",
      "/api/listings/sim-xnas-kite/chart",
      "/api/auth/get-session",
    ].map(async (path) => {
      const response = await fetch(origin + path, {
        signal: AbortSignal.timeout(4000),
      });
      const body = await response.json();
      assert.equal(response.status, 503);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(response.headers.get("retry-after"), "1");
      assert.equal(body.error?.code, "SERVICE_UNAVAILABLE");
      assert.ok(!JSON.stringify(body).includes(url.hostname));
      return { path, status: response.status, retryAfter: 1, sanitized: true };
    }),
  );
  report.overloaded = results;
} catch {
  report.failed = true;
  process.exitCode = 1;
  console.error(
    "Ceiling rehearsal stopped; releasing only its own connections. Raw errors hidden.",
  );
} finally {
  if (timer) clearTimeout(timer);
  held.forEach((connection) => connection.destroy());
  await pool.end();
  // Even a failed assertion must verify the public service recovered.
  try {
    await delay(1500);
    const restored = await fetch(origin + "/api/directory?page=1", {
      signal: AbortSignal.timeout(10000),
    });
    const data = await restored.json();
    assert.equal(restored.status, 200);
    assert.equal(data.records.length, 30);
    report.recovered = true;
  } catch {
    report.recovered = false;
    process.exitCode = 1;
  }
  report.finishedAt = new Date().toISOString();
  await writeFile(
    ".local/hosting/overload-report.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
}
