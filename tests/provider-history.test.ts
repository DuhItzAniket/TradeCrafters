import { test } from "node:test";
import assert from "node:assert/strict";
import {
  authorizedHistoryPlan,
  historyPlanSchema,
  normalizeDailyHistory,
  HistoryFault,
} from "../packages/domain/src/provider-history";

const plan = {
  provider: "twelvedata" as const,
  listingId: "fixture-us",
  symbol: "FIX_US",
  mic: "XNAS",
  providerExchange: "NASDAQ",
  providerCurrency: "USD",
  quoteCurrency: "USD",
  settlementCurrency: "USD",
  quoteUnitDenominator: "1" as const,
  timezone: "America/New_York",
  from: "2026-10-01",
  to: "2026-10-02",
  mappingEvidenceRef: "fixture-mapping-only",
};
const access = {
  provider: plan.provider,
  purpose: "private_research",
  dataset: "daily_history",
  status: "approved",
  listingIds: [plan.listingId],
  reviewedAt: "2026-10-01T00:00:00Z",
  expiresAt: "2026-11-01T00:00:00Z",
  evidenceRef: "fixture-access-only",
};
const now = "2026-10-24T00:00:00.000Z";
const fault = (code: string) => (error: unknown) =>
  error instanceof HistoryFault && error.code === code;

test("private history gate requires matching, current approval before accepting a plan", () => {
  assert.equal(
    authorizedHistoryPlan(plan, access, now).listingId,
    plan.listingId,
  );
  for (const change of [
    { status: "unknown" },
    { provider: "eodhd" },
    { listingIds: ["other"] },
    { expiresAt: now },
    { reviewedAt: "2026-10-25T00:00:00Z" },
  ]) {
    assert.throws(
      () => authorizedHistoryPlan(plan, { ...access, ...change }, now),
      fault("RESEARCH_ACCESS_REQUIRED"),
    );
  }
  // Fractional and whole-second timestamp forms compare as instants, not strings.
  assert.throws(
    () =>
      authorizedHistoryPlan(
        plan,
        { ...access, expiresAt: "2026-10-24T00:00:00Z" },
        now,
      ),
    fault("RESEARCH_ACCESS_REQUIRED"),
  );
});

test("history windows exclude incomplete exchange-local days around DST boundaries", () => {
  const london = {
    ...plan,
    timezone: "Europe/London",
    from: "2026-10-24",
    to: "2026-10-24",
  };
  assert.throws(
    () => authorizedHistoryPlan(london, access, "2026-10-24T22:30:00Z"),
    fault("INVALID_PLAN"),
  );
  assert.equal(
    authorizedHistoryPlan(london, access, "2026-10-24T23:30:00Z").to,
    "2026-10-24",
  );
  const newYork = { ...plan, from: "2026-10-23", to: "2026-10-23" };
  assert.throws(
    () => authorizedHistoryPlan(newYork, access, "2026-10-24T00:00:00Z"),
    fault("INVALID_PLAN"),
  );
});

test("mapping rejects batch symbols, invalid dates, unreviewed unit conversions and oversized windows", () => {
  for (const change of [
    { symbol: "AAPL,MSFT" },
    { symbol: "A?apikey=secret" },
    { from: "2026-02-30" },
    { from: "2026-08-01" },
    { to: "2026-09-30" },
    { timezone: "+05:30" },
    { quoteCurrency: "GBP", settlementCurrency: "USD" },
    { quoteUnitDenominator: "100" },
    { providerCurrency: "EUR" },
  ]) {
    assert.equal(
      historyPlanSchema.safeParse({ ...plan, ...change }).success,
      false,
    );
  }
  const pence = {
    ...plan,
    quoteCurrency: "GBX",
    providerCurrency: "GBp",
    settlementCurrency: "GBP",
    quoteUnitDenominator: "100",
  };
  assert.equal(historyPlanSchema.safeParse(pence).success, true);
  assert.equal(
    historyPlanSchema.safeParse({ ...pence, quoteUnitDenominator: "1" })
      .success,
    false,
  );
  assert.equal(
    historyPlanSchema.safeParse({
      ...plan,
      provider: "eodhd",
      symbol: "FIX_US.LSE",
      providerExchange: "US",
    }).success,
    false,
  );
});

const body = () => ({
  status: "ok",
  meta: {
    symbol: plan.symbol,
    interval: "1day",
    currency: "USD",
    exchange_timezone: plan.timezone,
    exchange: plan.providerExchange,
    mic_code: plan.mic,
    type: "Common Stock",
  },
  values: [
    {
      datetime: "2026-10-01",
      open: "9007199254740993.12345678901",
      high: "9007199254740994",
      low: "9007199254740992",
      close: "9007199254740993.12345678902",
      volume: "9007199254740993",
    },
  ],
});
test("history retains exact decimals, exchange dates and provenance without granting execution or display", () => {
  const result = normalizeDailyHistory(plan, JSON.stringify(body()), now);
  assert.equal(result.bars[0].close, "9007199254740993.12345678902");
  assert.equal(result.bars[0].volume, "9007199254740993");
  assert.equal(result.bars[0].tradingDate, "2026-10-01");
  assert.equal(result.executionEligible, false);
  assert.equal(result.publicDisplayAuthorized, false);
  assert.equal(result.priceAdjustment, "unadjusted");
});
test("same ticker on a different MIC, currency, timezone or asset type cannot pass metadata checks", () => {
  for (const change of [
    { mic_code: "XNYS" },
    { symbol: "OTHER" },
    { currency: "EUR" },
    { exchange_timezone: "UTC" },
    { exchange: "NYSE" },
    { type: "ETF" },
  ]) {
    const value = body();
    Object.assign(value.meta, change);
    assert.throws(
      () => normalizeDailyHistory(plan, JSON.stringify(value), now),
      fault("INVALID_DATA"),
    );
  }
});
test("history rejects duplicate, unordered, out-of-window, impossible and rounded numeric bars", () => {
  for (const change of [
    { datetime: "2026-09-30" },
    { datetime: "2026-02-30" },
    { low: "0" },
    { high: "1" },
    { open: "NaN" },
    { close: 100 },
    { close: "1.123456789012" },
  ]) {
    const value = body();
    Object.assign(value.values[0], change);
    assert.throws(
      () => normalizeDailyHistory(plan, JSON.stringify(value), now),
      fault("INVALID_DATA"),
    );
  }
  const value = body();
  value.values.push({ ...value.values[0] });
  assert.throws(
    () => normalizeDailyHistory(plan, JSON.stringify(value), now),
    fault("INVALID_DATA"),
  );
  value.values[0].datetime = "2026-10-02";
  assert.throws(
    () => normalizeDailyHistory(plan, JSON.stringify(value), now),
    fault("INVALID_DATA"),
  );
});
test("EODHD separates raw and adjusted prices and never upgrades a composite suffix to venue proof", () => {
  const eod = {
    ...plan,
    provider: "eodhd" as const,
    providerExchange: "US",
    symbol: "FIX_US.US",
  };
  const csv =
    "Date,Open,High,Low,Close,Adjusted_close,Volume\r\n2026-10-01,100,110,90,101,50.5000,12\r\n";
  const result = normalizeDailyHistory(eod, csv, now);
  assert.equal(result.bars[0].close, "101");
  assert.equal(result.bars[0].adjustedClose, "50.5");
  assert.equal(result.volumeAdjustment, "split_adjusted");
  assert.equal(result.sourceScope, "composite");
  assert.equal(result.sourceIdentity, "reviewed_mapping_only");
  for (const invalid of [
    "",
    csv.replace("Adjusted_close", "Adjusted Close"),
    csv.replace("50.5000", "0"),
    csv.replace(",12", ",12,13"),
  ])
    assert.throws(
      () => normalizeDailyHistory(eod, invalid, now),
      fault("INVALID_DATA"),
    );
});
