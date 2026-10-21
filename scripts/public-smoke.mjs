import assert from "node:assert/strict";
const origin = "https://tradecrafters-preview-gamma.vercel.app";
const results = [];
for (const path of [
  "/api/health",
  "/",
  "/sign-in",
  "/api/directory?page=1",
  "/api/listings/sim-xlon-atlas/chart",
  "/api/trading/portfolio",
]) {
  const started = performance.now();
  try {
    const response = await fetch(origin + path, {
      redirect: "manual",
      signal: AbortSignal.timeout(20000),
      headers: { "User-Agent": "TradeCrafters-public-smoke" },
    });
    const expected = path === "/api/trading/portfolio" ? 401 : 200;
    assert.equal(response.status, expected);
    assert.ok(response.headers.get("cache-control")?.includes("no-store"));
    let bytes = 0;
    const chunks = [];
    for await (const chunk of response.body) {
      bytes += chunk.length;
      assert.ok(bytes <= 512 * 1024);
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks).toString("utf8");
    if (path === "/" || path === "/sign-in") {
      assert.ok(body.includes("TradeCrafters"));
      const policy = response.headers.get("content-security-policy") || "";
      const nonce = policy.match(/'nonce-([^']+)'/)?.[1];
      assert.ok(nonce);
      assert.ok(policy.includes("'strict-dynamic'"));
      const scripts = [...body.matchAll(/<script\b([^>]*)>/g)];
      assert.ok(scripts.length > 0);
      assert.ok(
        scripts.every((script) => script[1].includes(`nonce="${nonce}"`)),
      );
      assert.ok(
        !policy
          .split(";")
          .find((part) => part.trim().startsWith("script-src"))
          ?.includes("unsafe-"),
      );
    } else {
      const data = JSON.parse(body);
      if (path === "/api/health") assert.deepEqual(data, { status: "ok" });
      else if (path.startsWith("/api/directory"))
        assert.ok(data.records.length === 30 && data.total === 2889);
      else if (path.includes("/chart"))
        assert.ok(data.dataMode === "synthetic" && data.points.length > 0);
      else assert.equal(data.error.code, "UNAUTHENTICATED");
    }
    results.push({
      path,
      status: response.status,
      passed: true,
      elapsedMs: Math.round(performance.now() - started),
    });
  } catch {
    results.push({
      path,
      passed: false,
      elapsedMs: Math.round(performance.now() - started),
    });
    process.exitCode = 1;
  }
}
// Fixed paths, aggregate outcomes only: no server bodies, cookies, IDs or query input.
console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      scope:
        "public synthetic smoke; no authenticated trades or availability SLA",
      results,
    },
    null,
    2,
  ),
);
