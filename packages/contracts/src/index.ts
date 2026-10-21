import { z } from "zod";

export const currencyCode = z.enum([
  "USD",
  "EUR",
  "GBP",
  "INR",
  "JPY",
  "HKD",
  "AUD",
  "CAD",
  "ZAR",
  "BRL",
  "SAR",
  "KWD",
]);
export const createAccountSchema = z
  .object({ reportingCurrency: currencyCode })
  .strict();
export const createWalletSchema = z.object({ currency: currencyCode }).strict();
export const accountId = z.string().uuid();
export const listingId = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);
export const idempotencyKey = z.string().regex(/^[a-zA-Z0-9_-]{16,96}$/);
export const orderIntentSchema = z
  .object({
    accountId,
    listingId,
    quoteId: z.string().uuid(),
    side: z.enum(["BUY", "SELL"]),
    orderType: z.literal("MARKET"),
    quantity: z.number().int().min(1).max(1000000),
  })
  .strict();
export const trainingQuoteRequest = z.object({ accountId, listingId }).strict();
export const fxQuoteRequest = z
  .object({ accountId, fromCurrency: currencyCode, toCurrency: currencyCode })
  .strict()
  .refine((value) => value.fromCurrency !== value.toCurrency);
export const fxIntentSchema = z
  .object({
    accountId,
    quoteId: z.string().uuid(),
    sourceMinor: z.string().regex(/^[1-9]\d{0,29}$/),
  })
  .strict();
export const resetIntentSchema = z
  .object({ accountId, confirmation: z.literal("RESET") })
  .strict();
export const operationQuery = z
  .object({ accountId, key: idempotencyKey })
  .strict();
export const activityQuery = z
  .object({ accountId, before: z.string().uuid().optional() })
  .strict();
export const verifyFactorSchema = z
  .object({ code: z.string().regex(/^\d{6}$/) })
  .strict();
export const simulationControlSchema = z
  .object({
    scope: z.enum(["funding", "execution"]).default("funding"),
    paused: z.boolean(),
    reason: z.string().trim().min(10).max(300),
  })
  .strict();
export const directoryQuery = z
  .object({
    q: z.string().trim().max(80).default(""),
    country: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .optional(),
    kind: z.enum(["OPRT", "SGMT"]).optional(),
    classification: z
      .enum(["cash_equity", "other_facility", "unknown"])
      .optional(),
    page: z.coerce.number().int().min(1).max(1000).default(1),
  })
  .strict();
export type ApiErrorCode =
  | "UNAUTHENTICATED"
  | "UNVERIFIED_IDENTITY"
  | "ACCOUNT_REQUIRED"
  | "INVALID_REQUEST"
  | "FORBIDDEN_ORIGIN"
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMITED"
  | "FORBIDDEN"
  | "MFA_REQUIRED"
  | "REAUTH_REQUIRED"
  | "INVALID_FACTOR"
  | "NOT_FOUND"
  | "SIMULATION_PAUSED"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR";
export type ApiFailure = { error: { code: ApiErrorCode; message: string } };
