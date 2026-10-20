import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  roundHalfEven,
  decimalPrice,
  fillCalculation,
  assertQuoteFresh,
  saleBasis,
  convertMark,
  trainingRate,
  trainingScenario,
  trainingModel,
  type TrainingQuote,
} from "@tradecrafters/domain/trading";
import {
  orderIntentSchema,
  fxIntentSchema,
  resetIntentSchema,
} from "@tradecrafters/contracts";
import { scenarios } from "@tradecrafters/market-catalog/scenarios";
import { fictionalPolicy } from "../packages/database/src/policy-fixtures";
const now = new Date("2026-10-20T10:00:00.000Z");
function fixture(index = 0) {
  const listing = scenarios[index],
    rules = fictionalPolicy(listing).rules;
  const quote: TrainingQuote = {
    id: randomUUID(),
    accountId: randomUUID(),
    listingId: listing.id,
    mic: listing.mic,
    dataMode: "synthetic",
    scenario: trainingScenario,
    model: trainingModel,
    provider: "project-synthetic-v1",
    reference: listing.price,
    currency: listing.currency,
    quoteUnit: listing.quoteUnit,
    unitNumerator: listing.unitNumerator,
    unitDenominator: listing.unitDenominator,
    policyId: "a".repeat(64),
    marketAt: now.toISOString(),
    observedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 30000).toISOString(),
  };
  const order = {
    accountId: quote.accountId,
    listingId: quote.listingId,
    quoteId: quote.id,
    side: "BUY" as const,
    orderType: "MARKET" as const,
    quantity: listing.lot,
  };
  return { quote, rules, order };
}
test("half-even cash rounding handles both signs, ties and integers beyond Number precision", () => {
  for (const [n, d, value] of [
    [5n, 2n, 2n],
    [7n, 2n, 4n],
    [-5n, 2n, -2n],
    [-7n, 2n, -4n],
    [90071992547409931n, 10n, 9007199254740993n],
  ])
    assert.equal(roundHalfEven(n, d), value);
  assert.equal(decimalPrice(5n, 3), "0.005");
  assert.throws(() => roundHalfEven(1n, 0n));
});
test("reference-price model rounds buys up and sells down and discloses zero fees", () => {
  const { quote, rules, order } = fixture();
  quote.reference = "100.00";
  const buy = fillCalculation(quote, rules, { ...order, quantity: 2 });
  const sell = fillCalculation(quote, rules, {
    ...order,
    side: "SELL",
    quantity: 2,
  });
  assert.equal(buy.price, "100.05");
  assert.equal(buy.notionalMinor, "20010");
  assert.equal(sell.price, "99.95");
  assert.equal(sell.notionalMinor, "19990");
  assert.equal(buy.feesMinor, "0");
  assert.equal(buy.model, "reference-spread-v1");
});
test("all regional fixtures enforce their own lots and quote units with native settlement", () => {
  for (let index = 0; index < scenarios.length; index++) {
    const { quote, rules, order } = fixture(index);
    const result = fillCalculation(quote, rules, order);
    assert.ok(BigInt(result.notionalMinor) > 0n);
    assert.ok(BigInt(result.notionalMinor) < 10000000000n);
  }
  const uk = fixture(1);
  assert.equal(
    fillCalculation(uk.quote, uk.rules, uk.order).notionalMinor,
    "1249",
  );
  const kw = fixture(9);
  assert.equal(
    fillCalculation(kw.quote, kw.rules, kw.order).notionalMinor,
    "747",
  );
  const jp = fixture(3);
  assert.equal(
    fillCalculation(jp.quote, jp.rules, jp.order).notionalMinor,
    "842500",
  );
});
test("tick selection crosses ladder boundaries without selecting an invalid old tick", () => {
  const { quote, rules, order } = fixture();
  quote.reference = "99.99";
  rules.quoteDecimals = 2;
  rules.priceBand = { lower: "1", upper: "200" };
  rules.ticks = [
    { from: "0", to: "100", step: "0.01" },
    { from: "100", to: null, step: "0.05" },
  ];
  assert.equal(fillCalculation(quote, rules, order).price, "100.05");
  quote.reference = "100.00";
  assert.equal(
    fillCalculation(quote, rules, { ...order, side: "SELL" }).price,
    "99.95",
  );
});
test("quantity, bands, notional caps and wrong account/quote fail before arithmetic posting", () => {
  const { quote, rules, order } = fixture(3);
  assert.throws(
    () => fillCalculation(quote, rules, { ...order, quantity: 1 }),
    /training rules/,
  );
  assert.throws(
    () => fillCalculation(quote, rules, { ...order, quantity: 0 }),
    /bounded/,
  );
  assert.throws(
    () => fillCalculation(quote, rules, { ...order, quantity: 1000000 }),
    /cap/,
  );
  assert.throws(
    () => fillCalculation(quote, rules, { ...order, accountId: randomUUID() }),
    /belong/,
  );
  rules.priceBand.upper = quote.reference;
  assert.throws(() => fillCalculation(quote, rules, order), /outside/);
});
test("quote freshness rejects the exact expiry, future observations and invalid clocks", () => {
  const { quote } = fixture();
  assert.doesNotThrow(() => assertQuoteFresh(quote, now));
  assert.doesNotThrow(() =>
    assertQuoteFresh(quote, new Date(now.getTime() + 29999)),
  );
  assert.throws(() => assertQuoteFresh(quote, new Date(quote.expiresAt)));
  assert.throws(() => assertQuoteFresh(quote, new Date(now.getTime() - 1)));
  assert.throws(() => assertQuoteFresh(quote, new Date("invalid")));
});
test("partial disposals allocate total basis and final liquidation consumes every residual", () => {
  let basis = 1001n,
    quantity = 3n;
  for (const sold of [1n, 1n, 1n]) {
    const part = saleBasis(basis, quantity, sold);
    basis -= part;
    quantity -= sold;
  }
  assert.equal(basis, 0n);
  assert.equal(quantity, 0n);
  assert.throws(() => saleBasis(100n, 1n, 2n));
  assert.equal(saleBasis(9007199254740993n, 3n, 1n), 3002399751580331n);
});
test("reporting FX applies each currency exponent and preserves signed P&L", () => {
  assert.equal(convertMark(10000n, "USD", "JPY"), 15000n);
  assert.equal(convertMark(10000n, "USD", "KWD"), 30000n);
  assert.equal(convertMark(-10000n, "USD", "GBP"), -8000n);
  assert.deepEqual(trainingRate("KWD", "USD"), {
    numerator: "10",
    denominator: "3",
  });
});
test("trading intents reject client prices, ownership fields, clocks, malformed keys and silent FX", () => {
  const { order } = fixture();
  assert.equal(orderIntentSchema.safeParse(order).success, true);
  for (const extra of [
    { executionPrice: "1" },
    { username: "other" },
    { quantity: "1" },
    { quantity: 1.5 },
    { side: "buy" },
    { marketAt: now.toISOString() },
    { autoFx: true },
    { quantity: 1000001 },
  ])
    assert.equal(
      orderIntentSchema.safeParse({ ...order, ...extra }).success,
      false,
    );
  assert.equal(
    fxIntentSchema.safeParse({
      accountId: order.accountId,
      quoteId: randomUUID(),
      sourceMinor: "100",
      rate: "5",
    }).success,
    false,
  );
  assert.equal(
    resetIntentSchema.safeParse({
      accountId: order.accountId,
      confirmation: "yes",
    }).success,
    false,
  );
});
