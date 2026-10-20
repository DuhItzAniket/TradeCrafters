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
export const directoryQuery = z
  .object({
    q: z.string().trim().max(80).default(""),
    country: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .optional(),
    kind: z.enum(["OPRT", "SGMT"]).optional(),
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
  | "INTERNAL_ERROR";
export type ApiFailure = { error: { code: ApiErrorCode; message: string } };
