import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

// Deliberately bounded acceptance for the personal synthetic demo. This never
// signs in, writes finance, supplies spoofed proxy headers or raises limits.
const origin = process.argv[2];
assert.equal(process.argv[3], "--bounded-read-probe");
assert.equal(origin, "https://tradecrafters-preview-gamma.vercel.app");
const routes = [
  "/api/directory?page=1",
  "/api/directory?page=2",
  "/api/directory?country=JP",
  "/api/directory?country=GB",
  "/api/listings/sim-xnas-kite/chart?window=15m",
  "/api/listings/sim-xlon-atlas/chart?window=60m",
];
const report: {
  startedAt: string;
  scope: string;
  tiers: unknown[];
  completedAt?: string;
  passed?: boolean;
  lastResponse?: { path: string; status: number };
} = {
  startedAt: new Date().toISOString(),
  scope:
    "72 valid public reads at concurrency 1/2/4, including operator-to-Vercel latency; no SLA or saturation claim",
  tiers: [],
};
const percentile = (values: number[], p: number) =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1];
try {
  assert.equal(
    (
      await fetch(origin + "/api/health", {
        signal: AbortSignal.timeout(10000),
      })
    ).status,
    200,
  );
  for (const concurrency of [1, 2, 4]) {
    let next = 0;
    const results: { status: number; ms: number; bytes: number }[] = [];
    const started = performance.now();
    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        for (;;) {
          const index = next++;
          if (index >= 24) return;
          const path = routes[index % routes.length];
          const start = performance.now();
          const response: Response = await fetch(origin + path, {
            signal: AbortSignal.timeout(10000),
            redirect: "manual",
          });
          const bytes = await response.arrayBuffer();
          report.lastResponse = { path, status: response.status };
          results.push({
            status: response.status,
            ms: Math.round(performance.now() - start),
            bytes: bytes.byteLength,
          });
          assert.equal(response.headers.get("cache-control"), "no-store");
          assert.equal(response.status, 200);
          const data = JSON.parse(Buffer.from(bytes).toString("utf8"));
          if (path.startsWith("/api/directory")) {
            assert.equal(data.pageSize, 30);
            assert.ok(data.records.length <= 30);
          }
          assert.ok(bytes.byteLength < 128 * 1024);
        }
      }),
    );
    const elapsedMs = Math.round(performance.now() - started);
    const p95Ms = percentile(
      results.map((r) => r.ms),
      0.95,
    );
    const tier = {
      concurrency,
      requests: results.length,
      successful: results.filter((r) => r.status === 200).length,
      elapsedMs,
      requestsPerSecond: Number(
        ((results.length * 1000) / elapsedMs).toFixed(2),
      ),
      p50Ms: percentile(
        results.map((r) => r.ms),
        0.5,
      ),
      p95Ms,
      maxMs: Math.max(...results.map((r) => r.ms)),
      maxResponseBytes: Math.max(...results.map((r) => r.bytes)),
    };
    report.tiers.push(tier);
    console.log(JSON.stringify(tier));
    assert.ok(
      p95Ms <= 3000,
      "Personal-demo p95 acceptance exceeded 3 seconds; stop before increasing load.",
    );
  }
  assert.equal(
    (
      await fetch(origin + "/api/health", {
        signal: AbortSignal.timeout(10000),
      })
    ).status,
    200,
  );
  report.completedAt = new Date().toISOString();
  report.passed = true;
} catch {
  report.passed = false;
  console.error(
    "Bounded capacity acceptance failed; no higher tier will run. Raw responses hidden.",
  );
  process.exitCode = 1;
} finally {
  await writeFile(
    ".local/hosting/capacity-report.json",
    JSON.stringify(report, null, 2) + "\n",
  );
}
