import { createHash } from "node:crypto";
import { z } from "zod";
import { catalogTimestamp } from "./catalog";
import {
  authorizedHistoryPlan,
  researchAccessSchema,
} from "./provider-history";

export const researchAccountId = z.string().regex(/^[a-z][a-z0-9_-]{2,63}$/);
const allowance = z.number().int().min(0).max(1_000_000);
const review = {
  enabled: z.boolean(),
  reviewedAt: catalogTimestamp,
  expiresAt: catalogTimestamp,
  evidenceRef: z.string().min(8).max(255),
};
export const accountPolicySchema = z
  .object({
    provider: z.enum(["twelvedata", "eodhd"]),
    ...review,
    resetBasis: z.literal("UTC_fixed_windows"),
    minuteCredits: allowance,
    dayCredits: allowance,
    maxConcurrent: z.number().int().min(0).max(8),
    maxCacheEntries: z.number().int().min(0).max(128),
    maxCacheBytes: z.number().int().min(0).max(4_194_304),
  })
  .strict();
export const feedPolicySchema = z
  .object({
    dataset: z.literal("daily_history"),
    ...review,
    listingIds: z
      .array(z.string().regex(/^[A-Za-z0-9_-]{1,64}$/))
      .min(1)
      .max(20),
    minuteCredits: allowance,
    dayCredits: allowance,
    requestCredits: z.number().int().min(1).max(100),
    maxConcurrent: z.number().int().min(0).max(8),
    leaseMs: z.number().int().min(15_000).max(60_000),
    cache: z
      .object({
        ttlSeconds: z.number().int().min(0).max(300),
        maxEntries: z.number().int().min(0).max(128),
        maxBytes: z.number().int().min(0).max(4_194_304),
        backupsApproved: z.boolean(),
        evidenceRef: z.string().min(8).max(255),
      })
      .strict(),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (
      p.cache.ttlSeconds > 0 &&
      (!p.cache.backupsApproved ||
        p.cache.maxEntries === 0 ||
        p.cache.maxBytes === 0)
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Caching requires explicit storage/backup approval and finite capacity.",
      });
  });
export type AccountPolicy = z.infer<typeof accountPolicySchema>;
export type FeedPolicy = z.infer<typeof feedPolicySchema>;
export type CoordinationFaultCode =
  | "CONFIGURATION"
  | "UNAVAILABLE"
  | "DISABLED"
  | "LIMITED"
  | "BUSY"
  | "STALE_LEASE"
  | "INVALID_CACHE";
export class CoordinationFault extends Error {
  constructor(
    public code: CoordinationFaultCode,
    public retryAfterSeconds?: number,
  ) {
    super(`Market-data coordination failed: ${code}. Details hidden.`);
  }
}
export function historyRequestKey(plan: unknown, access: unknown, now: string) {
  const validated = authorizedHistoryPlan(plan, access, now);
  const permission = researchAccessSchema.parse(access);
  return createHash("sha256")
    .update(
      JSON.stringify({
        version: 1,
        dataset: "daily_history",
        plan: validated,
        permission,
      }),
    )
    .digest("hex");
}
export function reviewCurrent(
  policy: AccountPolicy | FeedPolicy,
  nowMs: number,
) {
  return (
    policy.enabled &&
    Date.parse(policy.reviewedAt) <= nowMs &&
    Date.parse(policy.expiresAt) > nowMs
  );
}
export function budgetWindow(
  nowMs: number,
  previous: number,
  periodMs: number,
) {
  // A backward database clock cannot reset an already charged allowance.
  const window = Math.max(Math.floor(nowMs / periodMs), previous);
  return {
    window,
    retryAfterSeconds: Math.max(
      1,
      Math.ceil(((window + 1) * periodMs - nowMs) / 1000),
    ),
  };
}
