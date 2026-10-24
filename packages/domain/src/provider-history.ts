import { z } from "zod";
import { Temporal } from "@js-temporal/polyfill";
import { catalogDate, catalogTimestamp } from "./catalog";

export const historyProvider = z.enum(["twelvedata", "eodhd"]);
export const historyPlanSchema = z
  .object({
    provider: historyProvider,
    listingId: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
    symbol: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9.^_-]{0,47}$/),
    mic: z.string().regex(/^[A-Z0-9]{4}$/),
    providerExchange: z.string().regex(/^[A-Za-z0-9_-]{1,24}$/),
    providerCurrency: z.string().regex(/^[A-Za-z]{3}$/),
    quoteCurrency: z.string().regex(/^[A-Z]{3}$/),
    settlementCurrency: z.string().regex(/^[A-Z]{3}$/),
    quoteUnitDenominator: z.enum(["1", "100", "1000"]),
    timezone: z
      .string()
      .min(1)
      .max(64)
      .refine((value) => {
        try {
          return (
            !/^[+-]/.test(value) &&
            Boolean(Temporal.Now.zonedDateTimeISO(value))
          );
        } catch {
          return false;
        }
      }),
    from: catalogDate,
    to: catalogDate,
    mappingEvidenceRef: z.string().min(8).max(255),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      !catalogDate.safeParse(value.from).success ||
      !catalogDate.safeParse(value.to).success
    )
      return;
    const days = Temporal.PlainDate.from(value.from).until(value.to).days;
    if (
      days < 0 ||
      days > 30 ||
      (value.provider === "eodhd" &&
        !value.symbol.endsWith(`.${value.providerExchange}`)) ||
      !(
        (value.quoteUnitDenominator === "1" &&
          value.quoteCurrency === value.settlementCurrency &&
          value.providerCurrency === value.quoteCurrency) ||
        (value.quoteCurrency === "GBX" &&
          value.settlementCurrency === "GBP" &&
          value.quoteUnitDenominator === "100" &&
          ["GBp", "GBX"].includes(value.providerCurrency))
      )
    )
      context.addIssue({
        code: "custom",
        message: "Inconsistent bounded history mapping.",
      });
  });
export type HistoryPlan = z.infer<typeof historyPlanSchema>;
export const researchAccessSchema = z
  .object({
    provider: historyProvider,
    purpose: z.literal("private_research"),
    dataset: z.literal("daily_history"),
    status: z.enum(["unknown", "approved"]),
    listingIds: z
      .array(z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/))
      .min(1)
      .max(20),
    reviewedAt: catalogTimestamp,
    expiresAt: catalogTimestamp,
    evidenceRef: z.string().min(8).max(255),
  })
  .strict();
export type ResearchAccess = z.infer<typeof researchAccessSchema>;
export type HistoryFaultCode =
  | "INVALID_PLAN"
  | "RESEARCH_ACCESS_REQUIRED"
  | "CONFIGURATION"
  | "THROTTLED"
  | "DENIED"
  | "UPSTREAM_FAILURE"
  | "INVALID_DATA"
  | "TOO_LARGE"
  | "TIMEOUT"
  | "TRANSPORT";
export class HistoryFault extends Error {
  constructor(
    public code: HistoryFaultCode,
    public retryAfterSeconds?: number,
  ) {
    super(`Market-data research failed: ${code}. Provider details hidden.`);
  }
}
export function authorizedHistoryPlan(
  input: unknown,
  authorization: unknown,
  now: string,
): HistoryPlan {
  const parsed = historyPlanSchema.safeParse(input);
  if (!parsed.success || !catalogTimestamp.safeParse(now).success)
    throw new HistoryFault("INVALID_PLAN");
  const plan = parsed.data,
    access = researchAccessSchema.safeParse(authorization);
  const today = Temporal.Instant.from(now)
    .toZonedDateTimeISO(plan.timezone)
    .toPlainDate()
    .toString();
  if (plan.to >= today) throw new HistoryFault("INVALID_PLAN");
  if (
    !access.success ||
    access.data.status !== "approved" ||
    access.data.provider !== plan.provider ||
    !access.data.listingIds.includes(plan.listingId) ||
    Temporal.Instant.compare(access.data.reviewedAt, now) > 0 ||
    Temporal.Instant.compare(access.data.expiresAt, now) <= 0
  )
    throw new HistoryFault("RESEARCH_ACCESS_REQUIRED");
  return plan;
}
const decimal = z.string().regex(/^\d{1,18}(?:\.\d{1,11})?$/);
const volume = z.string().regex(/^\d{1,30}$/);
const fields = {
  open: decimal,
  high: decimal,
  low: decimal,
  close: decimal,
  volume,
};
const barSchema = z.object({ datetime: catalogDate, ...fields });
const twelveSchema = z.object({
  status: z.literal("ok"),
  meta: z.object({
    symbol: z.string(),
    interval: z.literal("1day"),
    currency: z.string(),
    exchange_timezone: z.string(),
    exchange: z.string(),
    mic_code: z.string(),
    type: z.literal("Common Stock"),
  }),
  values: z.array(barSchema).min(1).max(31),
});
const exact = (value: string) => {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100_000_000_000n + BigInt(fraction.padEnd(11, "0"));
};
const canonical = (value: string) => {
  const [whole, fraction = ""] = value.split(".");
  const tail = fraction.replace(/0+$/, "");
  return BigInt(whole).toString() + (tail ? `.${tail}` : "");
};
export function normalizeDailyHistory(
  plan: HistoryPlan,
  body: string,
  observedAt: string,
) {
  try {
    plan = historyPlanSchema.parse(plan);
    catalogTimestamp.parse(observedAt);
    let rows: (z.infer<typeof barSchema> & { adjustedClose?: string })[];
    if (plan.provider === "twelvedata") {
      const value = twelveSchema.parse(JSON.parse(body)),
        meta = value.meta;
      if (
        meta.symbol !== plan.symbol ||
        meta.mic_code !== plan.mic ||
        meta.exchange !== plan.providerExchange ||
        meta.currency !== plan.providerCurrency ||
        meta.exchange_timezone !== plan.timezone
      )
        throw Error();
      rows = value.values;
    } else {
      // Fixed numeric CSV fields retain provider decimals without JSON Number rounding.
      const lines = body
        .replace(/^\uFEFF/, "")
        .trim()
        .split(/\r?\n/);
      if (
        lines.shift() !== "Date,Open,High,Low,Close,Adjusted_close,Volume" ||
        lines.length < 1 ||
        lines.length > 31
      )
        throw Error();
      rows = lines.map((line) => {
        const cells = line.split(",");
        if (cells.length !== 7) throw Error();
        const [datetime, open, high, low, close, adjustedClose, volume] = cells;
        return {
          ...barSchema.parse({ datetime, open, high, low, close, volume }),
          adjustedClose: decimal.parse(adjustedClose),
        };
      });
    }
    let previous = "";
    const bars = rows.map((row) => {
      if (
        row.datetime < plan.from ||
        row.datetime > plan.to ||
        row.datetime <= previous ||
        exact(row.low) <= 0n ||
        exact(row.open) < exact(row.low) ||
        exact(row.close) < exact(row.low) ||
        exact(row.open) > exact(row.high) ||
        exact(row.close) > exact(row.high) ||
        (row.adjustedClose !== undefined && exact(row.adjustedClose) <= 0n)
      )
        throw Error();
      previous = row.datetime;
      return {
        tradingDate: row.datetime,
        open: canonical(row.open),
        high: canonical(row.high),
        low: canonical(row.low),
        close: canonical(row.close),
        volume: BigInt(row.volume).toString(),
        ...(row.adjustedClose === undefined
          ? {}
          : { adjustedClose: canonical(row.adjustedClose) }),
      };
    });
    return {
      version: 1 as const,
      provider: plan.provider,
      listingId: plan.listingId,
      listingMic: plan.mic,
      sourceIdentity:
        plan.provider === "twelvedata"
          ? ("matched_provider_metadata" as const)
          : ("reviewed_mapping_only" as const),
      sourceScope:
        plan.provider === "eodhd" && plan.providerExchange === "US"
          ? ("composite" as const)
          : ("venue_mapping" as const),
      providerSymbol: plan.symbol,
      providerExchange: plan.providerExchange,
      quoteCurrency: plan.quoteCurrency,
      settlementCurrency: plan.settlementCurrency,
      quoteUnitDenominator: plan.quoteUnitDenominator,
      timezone: plan.timezone,
      interval: "1day" as const,
      priceAdjustment: "unadjusted" as const,
      volumeAdjustment:
        plan.provider === "eodhd"
          ? ("split_adjusted" as const)
          : ("provider_unspecified" as const),
      observedAt,
      mappingEvidenceRef: plan.mappingEvidenceRef,
      purpose: "private_research" as const,
      executionEligible: false as const,
      publicDisplayAuthorized: false as const,
      bars,
    };
  } catch {
    throw new HistoryFault("INVALID_DATA");
  }
}
