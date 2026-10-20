import { test } from "node:test";
import assert from "node:assert/strict";
import { scenarios } from "@tradecrafters/market-catalog/scenarios";
const base = process.env.BETTER_AUTH_URL || "http://127.0.0.1:3000";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
test("public training charts expose bounded authored data and real-time permission checks, without account data", async () => {
  for (const listing of scenarios) {
    const response = await fetch(`${base}/api/listings/${listing.id}/chart`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const data = await response.json();
    assert.equal(data.listingId, listing.id);
    assert.equal(data.dataMode, "synthetic");
    assert.equal(data.chartModel, "authored-path-v1");
    assert.equal(data.eligible, true);
    assert.ok(data.points.length > 0 && data.points.length <= 61);
    assert.equal(data.points.at(-1).price, listing.price);
    assert.equal(data.points.at(-1).at, data.marketAt);
    assert.ok(
      data.points.every(
        (p: { at: string }) => Date.parse(p.at) <= Date.parse(data.marketAt),
      ),
    );
    assert.ok(Math.abs(Date.now() - Date.parse(data.observedAt)) < 10000);
    assert.equal(
      Date.parse(data.expiresAt) - Date.parse(data.observedAt),
      60000,
    );
    assert.equal("accountId" in data, false);
    assert.equal("userId" in data, false);
  }
  const endpoint = `${base}/api/listings/sim-xlon-atlas/chart`;
  const all = await (await fetch(endpoint)).json(),
    short = await (await fetch(endpoint + "?window=15m")).json();
  assert.deepEqual(
    short.points,
    all.points.filter(
      (p: { at: string }) =>
        Date.parse(p.at) >= Date.parse(all.marketAt) - 900000,
    ),
  );
});
test("chart HTTP contracts deny caller clocks, duplicate filters, unbounded windows, real identifiers and mutations", async () => {
  const endpoint = `${base}/api/listings/sim-xlon-atlas/chart`;
  for (const query of [
    "?window=1y",
    "?window=15m&window=60m",
    "?at=2099-01-01T00:00:00Z",
    "?price=1",
    "?mode=real",
  ])
    assert.equal((await fetch(endpoint + query)).status, 400);
  assert.equal((await fetch(`${base}/api/listings/XNYS/chart`)).status, 404);
  assert.equal((await fetch(endpoint, { method: "POST" })).status, 405);
});
