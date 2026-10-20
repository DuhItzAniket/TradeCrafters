import { test } from "node:test";
import assert from "node:assert/strict";
import {
  trainingSeries,
  filterTrainingListings,
  type ListingFilters,
} from "@tradecrafters/domain/workbench";
import {
  checkOrderRules,
  sessionState,
  nextContinuousSession,
} from "@tradecrafters/domain/market-policy";
import { scenarios } from "@tradecrafters/market-catalog/scenarios";
import { fictionalPolicy } from "../packages/database/src/policy-fixtures";
import { trainingMarketAt } from "@tradecrafters/database/trading";
function input(index = 0) {
  const listing = scenarios[index];
  return {
    reference: listing.price,
    marketAt: trainingMarketAt(listing.timezone),
    ...fictionalPolicy(listing),
    minutes: 60 as const,
  };
}
test("authored chart points across all regions obey precision, ticks, bands, sessions and the server cutoff", () => {
  for (let i = 0; i < scenarios.length; i++) {
    const source = input(i),
      copy = JSON.stringify(source),
      points = trainingSeries(source);
    assert.ok(points.length > 0 && points.length <= 61);
    assert.equal(points.at(-1)?.price, source.reference);
    assert.equal(points.at(-1)?.at, source.marketAt);
    for (let n = 0; n < points.length; n++) {
      assert.ok(Date.parse(points[n].at) <= Date.parse(source.marketAt));
      assert.equal(
        sessionState(source.calendar, new Date(points[n].at)).phase,
        "continuous",
      );
      assert.equal(
        checkOrderRules(source.rules, {
          quantity: source.rules.boardLot,
          price: points[n].price,
          type: "market",
        }),
        "ELIGIBLE",
      );
      if (n) assert.ok(points[n].at > points[n - 1].at);
    }
    assert.equal(JSON.stringify(source), copy);
  }
});
test("chart windows are deterministic views of one authored path, never regenerated future history", () => {
  const source = input(1),
    all = trainingSeries(source),
    short = trainingSeries({ ...source, minutes: 15 });
  assert.deepEqual(trainingSeries(source), all);
  assert.deepEqual(
    short,
    all.filter(
      (p) => Date.parse(p.at) >= Date.parse(source.marketAt) - 15 * 60000,
    ),
  );
  assert.equal(short.length, 16);
});
test("charts omit auction, lunch-break and fictional holiday minutes", () => {
  const source = input(3);
  const morning = trainingSeries({
    ...source,
    marketAt: "2026-10-20T00:05:00.000Z",
  });
  assert.equal(morning.length, 6);
  const afternoon = trainingSeries({
    ...source,
    marketAt: "2026-10-20T03:45:00.000Z",
  });
  assert.equal(afternoon.length, 16);
  assert.equal(
    trainingSeries({ ...source, marketAt: "2026-10-21T01:15:00.000Z" }).length,
    0,
  );
});
test("chart generation rejects unbounded windows and invalid or off-tick references", () => {
  assert.throws(() => trainingSeries({ ...input(), minutes: 1000 as 60 }));
  assert.throws(() => trainingSeries({ ...input(), marketAt: "bad" }));
  assert.throws(() => trainingSeries({ ...input(3), reference: "10001" }));
  assert.throws(() => trainingSeries({ ...input(), reference: "0" }));
});
test("country, region, currency, MIC and watchlist filters preserve same-symbol listing identities", () => {
  const filters: ListingFilters = {
    q: " ATLS ",
    region: "",
    country: "",
    currency: "",
    mic: "",
    pinnedOnly: false,
  };
  assert.equal(filterTrainingListings(scenarios, filters).length, 2);
  assert.equal(
    filterTrainingListings(scenarios, { ...filters, country: "GB" })[0].id,
    "sim-xlon-atlas",
  );
  assert.equal(
    filterTrainingListings(scenarios, {
      ...filters,
      currency: "AUD",
      region: "Oceania",
      mic: "XASX",
    })[0].id,
    "sim-xasx-atlas",
  );
  assert.equal(
    filterTrainingListings(scenarios, { ...filters, pinnedOnly: true }, [
      "sim-xasx-atlas",
    ])[0].id,
    "sim-xasx-atlas",
  );
  assert.equal(
    filterTrainingListings(scenarios, {
      ...filters,
      country: "GB",
      currency: "AUD",
    }).length,
    0,
  );
});
test("next continuous sessions respect local breaks, holiday exceptions, DST and coverage bounds", () => {
  const jp = input(3).calendar;
  assert.equal(
    nextContinuousSession(jp, new Date("2026-10-20T02:45:00Z"))?.opensAt,
    "2026-10-20T03:30:00Z",
  );
  assert.equal(
    nextContinuousSession(jp, new Date("2026-10-21T01:00:00Z"))?.opensAt,
    "2026-10-22T00:00:00Z",
  );
  assert.equal(
    nextContinuousSession(jp, new Date("2026-12-31T20:00:00Z")),
    null,
  );
  assert.equal(
    nextContinuousSession(input(1).calendar, new Date("2026-10-23T17:00:00Z"))
      ?.opensAt,
    "2026-10-26T08:00:00Z",
  );
});
