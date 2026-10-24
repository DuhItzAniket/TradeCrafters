import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { fetchDailyHistory } from "../scripts/market-data/history-client";
import { HistoryFault } from "../packages/domain/src/provider-history";

const base = process.env.HISTORY_SIMULATION_URL;
if (!base || !/^http:\/\/127\.0\.0\.1:\d+$/.test(base))
  throw Error("Run npm run test:providers to start the local simulation.");
const venues = [
  ["US", "XNAS", "NASDAQ", "USD", "America/New_York"],
  ["UK", "XLON", "LSE", "GBp", "Europe/London"],
  ["JP", "XTKS", "JPX", "JPY", "Asia/Tokyo"],
  ["IN", "XNSE", "NSE", "INR", "Asia/Kolkata"],
  ["HK", "XHKG", "HKEX", "HKD", "Asia/Hong_Kong"],
  ["AU", "XASX", "ASX", "AUD", "Australia/Sydney"],
  ["ZA", "XJSE", "JSE", "ZAR", "Africa/Johannesburg"],
  ["AE", "XDFM", "DFM", "AED", "Asia/Dubai"],
  ["BR", "BVMF", "B3", "BRL", "America/Sao_Paulo"],
];
function input(region = "US", scenario = region) {
  const [, mic, providerExchange, providerCurrency, timezone] = venues.find(
    (row) => row[0] === region,
  )!;
  return {
    provider: "twelvedata",
    listingId: "fixture-" + region,
    symbol: "FIX_" + scenario,
    mic,
    providerExchange,
    providerCurrency,
    quoteCurrency: region === "UK" ? "GBX" : providerCurrency,
    settlementCurrency: region === "UK" ? "GBP" : providerCurrency,
    quoteUnitDenominator: region === "UK" ? "100" : "1",
    timezone,
    from: "2026-10-01",
    to: "2026-10-02",
    mappingEvidenceRef: "fixture-mapping-only",
  };
}
const access = (plan: ReturnType<typeof input>) => ({
  provider: plan.provider,
  purpose: "private_research",
  dataset: "daily_history",
  status: "approved",
  listingIds: [plan.listingId],
  reviewedAt: "2026-10-01T00:00:00Z",
  expiresAt: "2026-11-01T00:00:00Z",
  evidenceRef: "fixture-access-only",
});
const options = {
  apiKey: "fixture-market-data-key",
  fixtureBaseUrl: base + "/twelve",
  now: "2026-10-24T00:00:00.000Z",
};
const fault = (code: string) => (error: unknown) =>
  error instanceof HistoryFault &&
  error.code === code &&
  !error.message.includes(options.apiKey) &&
  !error.message.includes("http");

test("real HTTP client normalizes synthetic fixtures across nine regional mappings", async () => {
  for (const [region] of venues) {
    const plan = input(region);
    const result = await fetchDailyHistory(plan, access(plan), options);
    assert.equal(result.listingMic, plan.mic);
    assert.equal(result.quoteCurrency, plan.quoteCurrency);
    assert.equal(result.quoteUnitDenominator, plan.quoteUnitDenominator);
    assert.equal(result.bars[0].close, "9007199254740993.12345678902");
    assert.equal(result.executionEligible, false);
  }
});
test("HTTP client classifies failure responses, including status-200 provider errors, without leaking keys", async () => {
  for (const [scenario, code] of [
    ["RATE", "THROTTLED"],
    ["ERROR", "THROTTLED"],
    ["DENIED", "DENIED"],
    ["FAIL", "UPSTREAM_FAILURE"],
    ["REDIRECT", "UPSTREAM_FAILURE"],
    ["HTML", "INVALID_DATA"],
    ["MALFORMED", "INVALID_DATA"],
    ["IDENTITY", "INVALID_DATA"],
    ["CURRENCY", "INVALID_DATA"],
    ["DATE", "INVALID_DATA"],
    ["DUPLICATE", "INVALID_DATA"],
    ["LARGE", "TOO_LARGE"],
    ["CHUNKED", "TOO_LARGE"],
  ]) {
    const plan = input("US", scenario);
    await assert.rejects(
      () => fetchDailyHistory(plan, access(plan), options),
      fault(code),
    );
  }
  const plan = input("US", "RATE");
  await assert.rejects(
    () => fetchDailyHistory(plan, access(plan), options),
    (error: unknown) =>
      error instanceof HistoryFault && error.retryAfterSeconds === 7,
  );
});
test("HTTP timeouts and connection failure stay bounded; the other provider still succeeds", async () => {
  const slow = input("US", "SLOW");
  await assert.rejects(
    () => fetchDailyHistory(slow, access(slow), { ...options, timeoutMs: 100 }),
    fault("TIMEOUT"),
  );
  const expiring = {
    ...access(slow),
    reviewedAt: new Date(Date.now() - 60_000).toISOString(),
    expiresAt: new Date(Date.now() + 800).toISOString(),
  };
  await assert.rejects(
    () =>
      fetchDailyHistory(slow, expiring, {
        ...options,
        now: undefined,
        timeoutMs: 3000,
      }),
    fault("RESEARCH_ACCESS_REQUIRED"),
  );
  const unreachable = input();
  const reservation = createServer();
  await new Promise<void>((resolve) =>
    reservation.listen(0, "127.0.0.1", resolve),
  );
  const address = reservation.address();
  if (!address || typeof address === "string")
    throw Error("No loopback port available.");
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  await assert.rejects(
    () =>
      fetchDailyHistory(unreachable, access(unreachable), {
        ...options,
        fixtureBaseUrl: `http://127.0.0.1:${address.port}/twelve`,
      }),
    fault("TRANSPORT"),
  );
  const plan = {
    ...input(),
    provider: "eodhd",
    providerExchange: "US",
    symbol: "FIX_US.US",
  };
  const result = await fetchDailyHistory(plan, access(plan), {
    ...options,
    fixtureBaseUrl: base + "/eodhd",
  });
  assert.equal(result.bars[0].adjustedClose, "4503599627370496.56172839451");
  assert.equal(result.sourceScope, "composite");
  assert.equal(result.sourceIdentity, "reviewed_mapping_only");
  for (const symbol of ["FIX_ERROR.US", "FIX_EMPTY.US"]) {
    const invalid = { ...plan, symbol };
    await assert.rejects(
      () =>
        fetchDailyHistory(invalid, access(invalid), {
          ...options,
          fixtureBaseUrl: base + "/eodhd",
        }),
      fault(symbol.includes("ERROR") ? "UPSTREAM_FAILURE" : "INVALID_DATA"),
    );
  }
});
test("approval and fixture override checks reject unsafe configuration before any network request", async () => {
  const plan = input();
  await assert.rejects(
    () =>
      fetchDailyHistory(plan, { ...access(plan), status: "unknown" }, options),
    fault("RESEARCH_ACCESS_REQUIRED"),
  );
  for (const fixtureBaseUrl of [
    "not-a-url",
    "https://example.com/twelve",
    base + "/eodhd",
    base + "/twelve?apikey=secret",
  ]) {
    await assert.rejects(
      () =>
        fetchDailyHistory(plan, access(plan), { ...options, fixtureBaseUrl }),
      fault("CONFIGURATION"),
    );
  }
  await assert.rejects(
    () =>
      fetchDailyHistory(plan, access(plan), {
        ...options,
        apiKey: "real-looking-but-not-allowed",
      }),
    fault("CONFIGURATION"),
  );
  const previousEnvironment = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";
    await assert.rejects(
      () => fetchDailyHistory(plan, access(plan), options),
      fault("CONFIGURATION"),
    );
  } finally {
    if (previousEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnvironment;
  }
});
