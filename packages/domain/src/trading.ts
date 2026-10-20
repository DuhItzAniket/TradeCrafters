import { z } from "zod";
import { currency, parseMinor, type CurrencyCode } from "./index";
import {
  ruleSchema,
  checkOrderRules,
  type RuleDefinition,
} from "./market-policy";
import { catalogTimestamp } from "./catalog";

export const trainingModel = "reference-spread-v1";
export const trainingScenario = "regional-training-2026-10-20-v1";
export const trainingFxVersion = "training-fx-v1";
// Independently versioned, project-authored exercise rates; never market FX or grant-policy inputs.
const rates: Record<CurrencyCode, readonly [bigint, bigint]> = {
  USD: [1n, 1n],
  EUR: [9n, 10n],
  GBP: [8n, 10n],
  INR: [83n, 1n],
  JPY: [150n, 1n],
  HKD: [78n, 10n],
  AUD: [15n, 10n],
  CAD: [14n, 10n],
  ZAR: [18n, 1n],
  BRL: [5n, 1n],
  SAR: [375n, 100n],
  KWD: [3n, 10n],
};
export function trainingRate(from: CurrencyCode, to: CurrencyCode) {
  const [a, b] = rates[from],
    [c, d] = rates[to];
  return { numerator: (c * b).toString(), denominator: (d * a).toString() };
}
export function roundHalfEven(n: bigint, d: bigint): bigint {
  if (n < 0n) return -roundHalfEven(-n, d);
  if (d <= 0n) throw Error("INVALID_DENOMINATOR");
  const q = n / d,
    r = n % d;
  return q + (r * 2n > d || (r * 2n === d && q % 2n === 1n) ? 1n : 0n);
}
export function decimalPrice(atoms: bigint, decimals: number) {
  const raw = atoms.toString().padStart(decimals + 1, "0");
  return decimals ? `${raw.slice(0, -decimals)}.${raw.slice(-decimals)}` : raw;
}
export function convertMark(
  amount: bigint,
  from: CurrencyCode,
  to: CurrencyCode,
) {
  const rate = trainingRate(from, to);
  return roundHalfEven(
    amount * BigInt(rate.numerator) * 10n ** BigInt(currency(to).exponent),
    BigInt(rate.denominator) * 10n ** BigInt(currency(from).exponent),
  );
}
export class TradingFault extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 422,
  ) {
    super(message);
  }
}
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);
const unit = z.string().regex(/^[1-9]\d{0,19}$/);
export const quoteSchema = z
  .object({
    id: z.string().uuid(),
    accountId: z.string().uuid(),
    listingId: id,
    mic: z.string().regex(/^[A-Z0-9]{4}$/),
    dataMode: z.literal("synthetic"),
    scenario: z.literal(trainingScenario),
    provider: z.literal("project-synthetic-v1"),
    model: z.literal(trainingModel),
    reference: z.string().regex(/^\d{1,18}(\.\d{1,6})?$/),
    currency: z.string().refine((value) => {
      try {
        currency(value);
        return true;
      } catch {
        return false;
      }
    }),
    quoteUnit: z.string().min(1).max(8),
    unitNumerator: unit,
    unitDenominator: unit,
    policyId: z.string().regex(/^[a-f0-9]{64}$/),
    marketAt: catalogTimestamp,
    observedAt: catalogTimestamp,
    expiresAt: catalogTimestamp,
  })
  .strict()
  .refine(
    (value) =>
      Date.parse(value.expiresAt) > Date.parse(value.observedAt) &&
      Date.parse(value.expiresAt) - Date.parse(value.observedAt) <= 30000,
  );
export type TrainingQuote = z.infer<typeof quoteSchema>;
export type OrderIntent = {
  accountId: string;
  listingId: string;
  quoteId: string;
  side: "BUY" | "SELL";
  orderType: "MARKET";
  quantity: number;
};
export function fillCalculation(
  quoteInput: TrainingQuote,
  rulesInput: RuleDefinition,
  intent: OrderIntent,
) {
  if (
    !Number.isSafeInteger(intent.quantity) ||
    intent.quantity < 1 ||
    intent.quantity > 1000000 ||
    !["BUY", "SELL"].includes(intent.side) ||
    intent.orderType !== "MARKET"
  )
    throw new TradingFault(
      "INVALID_ORDER",
      "Supply a bounded whole-share market order.",
    );
  const quote = quoteSchema.parse(quoteInput),
    rules = ruleSchema.parse(rulesInput);
  if (
    quote.id !== intent.quoteId ||
    quote.listingId !== intent.listingId ||
    quote.accountId !== intent.accountId ||
    rules.dataMode !== "synthetic" ||
    rules.evidenceKind !== "fictional"
  )
    throw new TradingFault(
      "QUOTE_MISMATCH",
      "The quote does not belong to this training order.",
    );
  const valid = checkOrderRules(rules, {
    quantity: String(intent.quantity),
    price: quote.reference,
    type: "market",
  });
  if (valid !== "ELIGIBLE")
    throw new TradingFault(
      valid,
      "The quantity or reference price does not satisfy this listing's training rules.",
    );
  const reference = parseMinor(quote.reference, rules.quoteDecimals);
  const target = reference * (intent.side === "BUY" ? 10005n : 9995n);
  const candidates = rules.ticks.flatMap((tick) => {
    const step = parseMinor(tick.step, rules.quoteDecimals),
      from = parseMinor(tick.from, rules.quoteDecimals),
      to = tick.to === null ? null : parseMinor(tick.to, rules.quoteDecimals);
    let value =
      intent.side === "BUY"
        ? ((target + 10000n * step - 1n) / (10000n * step)) * step
        : (target / (10000n * step)) * step;
    if (intent.side === "BUY" && value < from) value = from;
    if (intent.side === "SELL" && to !== null && value >= to)
      value = ((to - 1n) / step) * step;
    return value >= from && (to === null || value < to) && value > 0n
      ? [value]
      : [];
  });
  if (!candidates.length)
    throw new TradingFault(
      "INVALID_TICK",
      "No valid execution tick is available.",
    );
  const atoms = candidates.reduce((a, b) =>
    intent.side === "BUY" ? (a < b ? a : b) : a > b ? a : b,
  );
  const price = decimalPrice(atoms, rules.quoteDecimals);
  const check = checkOrderRules(rules, {
    quantity: String(intent.quantity),
    price,
    type: "market",
  });
  if (check !== "ELIGIBLE")
    throw new TradingFault(
      check,
      "The modeled execution price is outside this listing's allowed rules.",
    );
  const n =
    atoms *
    BigInt(intent.quantity) *
    BigInt(quote.unitNumerator) *
    10n ** BigInt(currency(quote.currency).exponent);
  const d = 10n ** BigInt(rules.quoteDecimals) * BigInt(quote.unitDenominator);
  const notional = roundHalfEven(n, d);
  if (notional <= 0n || notional.toString().length > 30)
    throw new TradingFault(
      "AMOUNT_OUT_OF_RANGE",
      "The order value cannot be represented in this wallet.",
    );
  if (notional > convertMark(10000000n, "USD", quote.currency as CurrencyCode))
    throw new TradingFault(
      "ORDER_CAP",
      "The order exceeds the model's 100,000 virtual USD equivalent cap.",
    );
  return {
    price,
    notionalMinor: notional.toString(),
    feesMinor: "0",
    rounding: "half-even" as const,
    roundingNumerator: (n - notional * d).toString(),
    roundingDenominator: d.toString(),
    model: trainingModel,
    halfSpreadBps: 5,
  };
}
export function assertQuoteFresh(quote: TrainingQuote, now = new Date()) {
  if (
    !Number.isFinite(now.getTime()) ||
    Date.parse(quote.observedAt) > now.getTime() ||
    Date.parse(quote.expiresAt) <= now.getTime()
  )
    throw new TradingFault(
      "QUOTE_STALE",
      "Refresh the training quote before submitting.",
      503,
    );
}
export function saleBasis(basis: bigint, owned: bigint, sold: bigint) {
  if (owned <= 0n || sold <= 0n || sold > owned || basis < 0n)
    throw new TradingFault(
      "INSUFFICIENT_SHARES",
      "There are not enough shares to sell.",
    );
  return sold === owned ? basis : roundHalfEven(basis * sold, owned);
}
export type FilledOrder = {
  orderId: string;
  fillId: string;
  journalId: string;
  listingId: string;
  symbol: string;
  mic: string;
  side: "BUY" | "SELL";
  quantity: string;
  currency: CurrencyCode;
  quoteUnit: string;
  reference: string;
  price: string;
  notionalMinor: string;
  feesMinor: string;
  allocatedBasisMinor: string;
  realizedMinor: string;
  rounding: string;
  roundingNumerator: string;
  roundingDenominator: string;
  model: string;
  halfSpreadBps: number;
  snapshotId: string;
  policyId: string;
  marketAt: string;
  observedAt: string;
  provider: string;
  scenario: string;
  reportingFx: {
    version: string;
    from: CurrencyCode;
    to: CurrencyCode;
    numerator: string;
    denominator: string;
    observedAt: string;
  };
};
export type FxResult = {
  id: string;
  quoteId: string;
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  debitMinor: string;
  creditMinor: string;
  sourceJournalId: string;
  targetJournalId: string;
  provider: string;
  evidenceRef: string;
  observedAt: string;
  rateNumerator: string;
  rateDenominator: string;
  rounding: string;
  remainderNumerator: string;
  remainderDenominator: string;
};
type ReceiptBase = {
  id: string;
  accountId: string;
  key: string;
  createdAt: string;
};
export type OperationPayload =
  | { kind: "order"; status: "filled"; order: FilledOrder }
  | { kind: "fx"; status: "converted"; conversion: FxResult }
  | { kind: "reset"; status: "reset"; nextAccountId: string }
  | {
      kind: "order" | "fx" | "reset";
      status: "rejected";
      code: string;
      message: string;
    };
export type OperationReceipt = ReceiptBase & OperationPayload;
export type OperationResult = { httpStatus: number; receipt: OperationReceipt };
