import { z } from "zod";
import { currencies, currency } from "./index";
import { catalogTimestamp } from "./catalog";
const code = z.enum(currencies.map((value) => value.code));
const positiveInteger = z.string().regex(/^[1-9]\d{0,29}$/);
export const fxQuoteSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,96}$/),
    accountId: z.string().uuid(),
    dataMode: z.literal("synthetic"),
    fromCurrency: code,
    toCurrency: code,
    rateNumerator: positiveInteger,
    rateDenominator: positiveInteger,
    provider: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
    evidenceRef: z.string().min(8).max(255),
    observedAt: catalogTimestamp,
    effectiveFrom: catalogTimestamp,
    expiresAt: catalogTimestamp,
    rounding: z.literal("floor"),
  })
  .strict()
  .refine(
    (value) =>
      value.fromCurrency !== value.toCurrency &&
      Date.parse(value.observedAt) <= Date.parse(value.effectiveFrom) &&
      Date.parse(value.expiresAt) > Date.parse(value.effectiveFrom) &&
      Date.parse(value.expiresAt) - Date.parse(value.observedAt) <= 300000,
    "FX quotes require distinct currencies and a bounded validity period",
  );
export type FxQuote = z.infer<typeof fxQuoteSchema>;
export const fxConversionRequestSchema = z
  .object({
    quoteId: z.string().regex(/^[a-zA-Z0-9_-]{1,96}$/),
    sourceMinor: positiveInteger,
  })
  .strict();

// A quote is a server-owned, account-bound scenario snapshot. This is a contract/calculation, never a ledger write.
export function calculateFxConversion(
  quoteInput: FxQuote,
  requestInput: z.infer<typeof fxConversionRequestSchema>,
  accountId: string,
  at = new Date(),
) {
  const quote = fxQuoteSchema.parse(quoteInput),
    request = fxConversionRequestSchema.parse(requestInput);
  if (quote.id !== request.quoteId || quote.accountId !== accountId)
    throw Error("FX_QUOTE_MISMATCH");
  const now = at.getTime();
  if (
    !Number.isFinite(now) ||
    Date.parse(quote.observedAt) > now ||
    Date.parse(quote.effectiveFrom) > now ||
    Date.parse(quote.expiresAt) <= now
  )
    throw Error("FX_QUOTE_EXPIRED_OR_FUTURE");
  const fromExponent = currency(quote.fromCurrency).exponent,
    toExponent = currency(quote.toCurrency).exponent;
  const numerator =
    BigInt(request.sourceMinor) *
    BigInt(quote.rateNumerator) *
    10n ** BigInt(toExponent);
  const denominator =
    BigInt(quote.rateDenominator) * 10n ** BigInt(fromExponent);
  const credit = numerator / denominator;
  if (credit <= 0n || credit.toString().length > 30)
    throw Error("FX_AMOUNT_OUT_OF_RANGE");
  return {
    quoteId: quote.id,
    accountId,
    dataMode: quote.dataMode,
    fromCurrency: quote.fromCurrency,
    toCurrency: quote.toCurrency,
    debitMinor: request.sourceMinor,
    creditMinor: credit.toString(),
    remainderNumerator: (numerator % denominator).toString(),
    remainderDenominator: denominator.toString(),
    rounding: quote.rounding,
    provider: quote.provider,
    evidenceRef: quote.evidenceRef,
    observedAt: quote.observedAt,
    expiresAt: quote.expiresAt,
  };
}
