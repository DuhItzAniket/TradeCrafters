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
export const verifyFactorSchema = z
  .object({ code: z.string().regex(/^\d{6}$/) })
  .strict();
export const simulationControlSchema = z
  .object({ paused: z.boolean(), reason: z.string().trim().min(10).max(300) })
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
  | "INTERNAL_ERROR";
export type ApiFailure = { error: { code: ApiErrorCode; message: string } };
