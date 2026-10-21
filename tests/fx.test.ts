import { test } from "node:test";
import assert from "node:assert/strict";
import { createFxReview, previewFxReview } from "../apps/web/src/lib/fx-review";
import {
  fxQuoteSchema,
  fxConversionRequestSchema,
  calculateFxConversion,
  type FxQuote,
} from "@tradecrafters/domain/fx";
const accountId = "00000000-0000-4000-8000-000000000001";
const quote: FxQuote = {
  id: "fictional-fx-v1",
  accountId,
  dataMode: "synthetic",
  fromCurrency: "USD",
  toCurrency: "JPY",
  rateNumerator: "150",
  rateDenominator: "1",
  provider: "scenario-v1",
  evidenceRef: "fictional-test-snapshot",
  observedAt: "2026-01-01T00:00:00Z",
  effectiveFrom: "2026-01-01T00:00:00Z",
  expiresAt: "2026-01-01T00:01:00Z",
  rounding: "floor",
};
const at = new Date("2026-01-01T00:00:30Z");

test("FX browser review survives wall-clock skew while server expiry stays strict", () => {
  const review = createFxReview(quote, 1000, 1250);
  assert.equal(
    previewFxReview(review, "10000", accountId, 1500).creditMinor,
    "15000",
  );
  // A slow or fast wall clock must not be used to authorize server execution.
  for (const wrongClock of ["2025-12-31T23:59:58Z", "2026-01-01T00:02:00Z"])
    assert.throws(() =>
      calculateFxConversion(
        quote,
        { quoteId: quote.id, sourceMinor: "10000" },
        accountId,
        new Date(wrongClock),
      ),
    );
  assert.throws(() =>
    previewFxReview(review, "10000", accountId, review.deadline),
  );
  assert.throws(() =>
    previewFxReview(
      review,
      "10000",
      "00000000-0000-4000-8000-000000000002",
      1500,
    ),
  );
});

test("FX browser review subtracts transport latency and rejects late or invalid timing", () => {
  assert.equal(createFxReview(quote, 1000, 1250).deadline, 61000);
  for (const [start, received] of [
    [1000, 61000],
    [1000, 999],
    [NaN, 1000],
    [-1, 1000],
  ])
    assert.throws(() => createFxReview(quote, start, received));
  const review = createFxReview(
    { ...quote, rateNumerator: "1", rateDenominator: "1000000" },
    1000,
    1250,
  );
  assert.throws(() => previewFxReview(review, "1", accountId, 1500));
});
test("FX converts native exponents exactly and discloses rounding remainder", () => {
  const jpy = calculateFxConversion(
    quote,
    { quoteId: quote.id, sourceMinor: "101" },
    accountId,
    at,
  );
  assert.equal(jpy.debitMinor, "101");
  assert.equal(jpy.creditMinor, "151");
  assert.equal(jpy.remainderNumerator, "50");
  assert.equal(jpy.remainderDenominator, "100");
  const kwd = calculateFxConversion(
    {
      ...quote,
      fromCurrency: "JPY",
      toCurrency: "KWD",
      rateNumerator: "1",
      rateDenominator: "500",
    },
    { quoteId: quote.id, sourceMinor: "150" },
    accountId,
    at,
  );
  assert.equal(kwd.creditMinor, "300");
});
test("FX remains exact beyond Number precision and cannot debit another account's quote", () => {
  const amount = "9007199254740993";
  assert.equal(
    calculateFxConversion(
      { ...quote, toCurrency: "EUR", rateNumerator: "1" },
      { quoteId: quote.id, sourceMinor: amount },
      accountId,
      at,
    ).creditMinor,
    amount,
  );
  assert.throws(
    () =>
      calculateFxConversion(
        quote,
        { quoteId: quote.id, sourceMinor: "100" },
        "another-account",
        at,
      ),
    /MISMATCH/,
  );
  assert.throws(
    () =>
      calculateFxConversion(
        quote,
        { quoteId: "other", sourceMinor: "100" },
        accountId,
        at,
      ),
    /MISMATCH/,
  );
});
test("FX quote and request contracts reject forged rates, real mode, invalid currencies and dust", () => {
  for (const change of [
    { dataMode: "real" },
    { toCurrency: "USD" },
    { toCurrency: "GBX" },
    { rateNumerator: "0" },
    { expiresAt: "2026-01-01T00:06:00Z" },
  ])
    assert.equal(
      fxQuoteSchema.safeParse({ ...quote, ...change }).success,
      false,
    );
  for (const sourceMinor of ["0", "-1", "1.1", "1e5", "1".repeat(31)])
    assert.equal(
      fxConversionRequestSchema.safeParse({ quoteId: quote.id, sourceMinor })
        .success,
      false,
    );
  assert.equal(
    fxConversionRequestSchema.safeParse({
      quoteId: quote.id,
      sourceMinor: "100",
      rateNumerator: "1000000",
    }).success,
    false,
  );
  assert.throws(
    () =>
      calculateFxConversion(
        { ...quote, rateNumerator: "1", rateDenominator: "10000" },
        { quoteId: quote.id, sourceMinor: "1" },
        accountId,
        at,
      ),
    /OUT_OF_RANGE/,
  );
});
test("FX rejects future/stale snapshots and treats expiry as exclusive", () => {
  for (const time of [
    "2025-12-31T23:59:59Z",
    quote.expiresAt,
    "2026-01-02T00:00:00Z",
  ])
    assert.throws(
      () =>
        calculateFxConversion(
          quote,
          { quoteId: quote.id, sourceMinor: "100" },
          accountId,
          new Date(time),
        ),
      /EXPIRED_OR_FUTURE/,
    );
});
