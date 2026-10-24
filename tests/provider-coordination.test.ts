import { test } from "node:test";
import assert from "node:assert/strict";
import {
  accountPolicySchema,
  feedPolicySchema,
  historyRequestKey,
  budgetWindow,
  reviewCurrent,
} from "../packages/domain/src/provider-coordination";
import {
  normalizeDailyHistory,
  validatedCachedHistory,
} from "../packages/domain/src/provider-history";
import { createResearchPool } from "../packages/database/src/provider-store";

const now = "2026-10-24T12:00:00.000Z";
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
  mappingEvidenceRef: "fixture-mapping",
};
const review = {
  enabled: true,
  reviewedAt: "2026-10-01T00:00:00Z",
  expiresAt: "2026-11-01T00:00:00Z",
  evidenceRef: "fixture-only-review",
};
const access = {
  provider: plan.provider,
  purpose: "private_research",
  dataset: "daily_history",
  status: "approved",
  listingIds: [plan.listingId],
  reviewedAt: review.reviewedAt,
  expiresAt: review.expiresAt,
  evidenceRef: review.evidenceRef,
};
const account = {
  provider: plan.provider,
  ...review,
  resetBasis: "UTC_fixed_windows",
  minuteCredits: 4,
  dayCredits: 20,
  maxConcurrent: 2,
  maxCacheEntries: 8,
  maxCacheBytes: 8192,
};
const feed = {
  dataset: "daily_history",
  ...review,
  listingIds: [plan.listingId],
  minuteCredits: 4,
  dayCredits: 20,
  requestCredits: 1,
  maxConcurrent: 2,
  leaseMs: 15000,
  cache: {
    ttlSeconds: 0,
    maxEntries: 0,
    maxBytes: 0,
    backupsApproved: false,
    evidenceRef: "fixture-no-storage",
  },
};
test("coordination policies reject assumed storage rights, unbounded capacity and unknown scopes", () => {
  assert.equal(accountPolicySchema.safeParse(account).success, true);
  assert.equal(feedPolicySchema.safeParse(feed).success, true);
  for (const change of [
    { maxConcurrent: 9 },
    { minuteCredits: -1 },
    { apiKey: "not-a-policy" },
    { resetBasis: "rolling" },
  ])
    assert.equal(
      accountPolicySchema.safeParse({ ...account, ...change }).success,
      false,
    );
  for (const change of [
    { dataset: "live" },
    { leaseMs: 10000 },
    { requestCredits: 0 },
    { listingIds: [] },
    { cache: { ...feed.cache, ttlSeconds: 10, maxEntries: 2, maxBytes: 8192 } },
  ])
    assert.equal(
      feedPolicySchema.safeParse({ ...feed, ...change }).success,
      false,
    );
  assert.equal(
    reviewCurrent(
      accountPolicySchema.parse({ ...account, expiresAt: now }),
      Date.parse(now),
    ),
    false,
  );
});
test("cache keys bind aliases, listing identity, currencies, dates, mapping and access evidence", () => {
  const key = historyRequestKey(plan, access, now);
  assert.equal(historyRequestKey({ ...plan }, { ...access }, now), key);
  for (const change of [
    { symbol: "FIX_OTHER" },
    { mic: "XNYS" },
    { providerExchange: "NYSE" },
    { mappingEvidenceRef: "fixture-other-review" },
    { to: "2026-10-01" },
  ])
    assert.notEqual(
      historyRequestKey({ ...plan, ...change }, access, now),
      key,
    );
  assert.notEqual(
    historyRequestKey(
      plan,
      { ...access, evidenceRef: "fixture-new-access" },
      now,
    ),
    key,
  );
});
test("budget rollover uses fixed UTC windows and cannot mint credits on a backwards clock", () => {
  assert.deepEqual(budgetWindow(60001, 0, 60000), {
    window: 1,
    retryAfterSeconds: 60,
  });
  assert.deepEqual(budgetWindow(59999, 1, 60000), {
    window: 1,
    retryAfterSeconds: 61,
  });
  assert.equal(budgetWindow(86400000, 0, 86400000).window, 1);
});
test("cached data is revalidated without upgrading provenance or restamping observation time", () => {
  const body = JSON.stringify({
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
        open: "100",
        high: "110",
        low: "90",
        close: "101",
        volume: "9007199254740993",
      },
    ],
  });
  const value = normalizeDailyHistory(plan, body, now);
  assert.deepEqual(validatedCachedHistory(plan, value), value);
  for (const change of [
    { executionEligible: true },
    { publicDisplayAuthorized: true },
    { listingMic: "XNYS" },
    { sourceScope: "composite" },
    { unknown: "value" },
  ])
    assert.throws(() => validatedCachedHistory(plan, { ...value, ...change }));
  assert.throws(() =>
    validatedCachedHistory(plan, {
      ...value,
      bars: [{ ...value.bars[0], close: 101 }],
    }),
  );
});
test("the provider pool never falls back to application credentials or an application schema", () => {
  for (const env of [
    { DATABASE_URL: "mysql://fixture:fixture@127.0.0.1:3307/tradecrafters_v2" },
    {
      PROVIDER_DATABASE_URL:
        "mysql://fixture:fixture@127.0.0.1:3307/tradecrafters_v2",
    },
    {
      PROVIDER_DATABASE_URL:
        "mysql://fixture:fixture@remote.example/tradecrafters_marketdata",
      PROVIDER_MYSQL_SSL: "false",
    },
  ])
    assert.throws(() => createResearchPool(env));
});
