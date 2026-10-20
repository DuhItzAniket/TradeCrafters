import { z } from "zod";
import { Temporal } from "@js-temporal/polyfill";

export const catalogDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    try {
      return Temporal.PlainDate.from(value).toString() === value;
    } catch {
      return false;
    }
  });
export const providerName = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/);
export const providerSymbol = z
  .string()
  .regex(/^[A-Za-z0-9^][A-Za-z0-9._:/^@+-]{0,79}$/);
export const catalogReason = z.string().trim().min(10).max(300);
export const catalogActor = z.string().regex(/^[a-zA-Z0-9:_-]{1,96}$/);
export const catalogTimestamp = z
  .string()
  .datetime()
  .refine((value) => {
    try {
      return Temporal.Instant.from(value).epochNanoseconds % 1000000n === 0n;
    } catch {
      return false;
    }
  });
export const aliasAssignmentSchema = z
  .object({
    listingId: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
    provider: providerName,
    alias: providerSymbol,
    effectiveFrom: catalogDate,
    effectiveTo: catalogDate.nullable(),
    reason: catalogReason,
    actor: catalogActor,
  })
  .strict()
  .refine(
    (value) =>
      value.effectiveTo === null || value.effectiveTo > value.effectiveFrom,
    "Alias end must follow start",
  );
export type AliasAssignment = z.infer<typeof aliasAssignmentSchema>;
export const aliasLookupSchema = z
  .object({ provider: providerName, alias: providerSymbol })
  .strict();

export function datesOverlap(
  a: { effectiveFrom: string; effectiveTo: string | null },
  b: { effectiveFrom: string; effectiveTo: string | null },
) {
  return (
    (b.effectiveTo === null || a.effectiveFrom < b.effectiveTo) &&
    (a.effectiveTo === null || b.effectiveFrom < a.effectiveTo)
  );
}

const mic = z.string().regex(/^[A-Z0-9]{4}$/);
const rawDate = z
  .string()
  .refine(
    (value) =>
      value === "" ||
      (/^\d{8}$/.test(value) &&
        catalogDate.safeParse(
          `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}`,
        ).success),
  );
export const micRecordSchema = z
  .object({
    mic,
    operatingMic: mic,
    kind: z.enum(["OPRT", "SGMT"]),
    name: z.string().min(1).max(255),
    category: z.string().regex(/^[A-Z]{1,10}$/),
    country: z.string().regex(/^[A-Z]{2}$/),
    city: z.string().max(100),
    status: z.enum(["ACTIVE", "UPDATED", "EXPIRED"]),
    created: rawDate,
    updated: rawDate,
    expires: rawDate,
  })
  .strict();
export type MicRecord = z.infer<typeof micRecordSchema>;
export const snapshotSchema = z
  .object({
    publishedOn: catalogDate,
    changesEffectiveOn: catalogDate,
    retrievedOn: catalogDate,
    sourceKind: z.enum(["iso10383", "test"]),
    sourceUrl: z
      .string()
      .url()
      .max(255)
      .refine((value) => value.startsWith("https://")),
    parentSnapshot: catalogDate.nullable(),
    records: z.array(micRecordSchema).min(1).max(10000),
    actor: catalogActor,
    reason: catalogReason,
  })
  .strict()
  .superRefine((value, context) => {
    const codes = new Set(value.records.map((row) => row.mic));
    if (
      codes.size !== value.records.length ||
      value.publishedOn > value.retrievedOn ||
      value.changesEffectiveOn < value.publishedOn ||
      (value.parentSnapshot !== null &&
        value.parentSnapshot >= value.publishedOn) ||
      value.records.some(
        (row) =>
          !codes.has(row.operatingMic) ||
          (row.kind === "OPRT" && row.mic !== row.operatingMic),
      )
    )
      context.addIssue({
        code: "custom",
        message:
          "Invalid snapshot dates, duplicate MICs or missing operating identity",
      });
  });
export type CatalogSnapshot = z.infer<typeof snapshotSchema>;
export function diffCatalog(previous: MicRecord[], next: MicRecord[]) {
  const before = new Map(previous.map((row) => [row.mic, row]));
  const after = new Map(next.map((row) => [row.mic, row]));
  return [...new Set([...before.keys(), ...after.keys()])]
    .sort()
    .flatMap<{ mic: string; kind: "added" | "removed" | "changed" }>((code) => {
      const old = before.get(code),
        current = after.get(code);
      if (!old) return [{ mic: code, kind: "added" as const }];
      if (!current) return [{ mic: code, kind: "removed" as const }];
      return Object.keys(old).some(
        (key) =>
          old[key as keyof MicRecord] !== current[key as keyof MicRecord],
      )
        ? [{ mic: code, kind: "changed" as const }]
        : [];
    });
}
export const classificationSchema = z
  .object({
    snapshotId: catalogDate,
    mic,
    classification: z.enum(["cash_equity", "other_facility", "unknown"]),
    evidenceRef: z
      .string()
      .url()
      .max(255)
      .refine((value) => value.startsWith("https://")),
    reviewedAt: catalogTimestamp,
    expiresAt: catalogTimestamp,
    actor: catalogActor,
    reason: catalogReason,
  })
  .strict();
export const capabilityTypes = [
  "listings",
  "historical",
  "eod",
  "delayed",
  "live",
  "display",
  "retention",
  "replay",
  "simulation",
] as const;
export const capabilitySchema = z
  .object({
    snapshotId: catalogDate,
    mic,
    provider: providerName,
    dataset: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
    listingScope: z.enum(["venue", "selected_listings"]),
    listingIds: z.array(z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/)).max(100),
    capability: z.enum(capabilityTypes),
    assetClass: z.literal("cash_equity"),
    feedType: z.enum(["reference", "historical", "eod", "delayed", "live"]),
    expectedDelaySeconds: z.number().int().min(0).max(604800),
    allowedAudience: z.enum(["private", "public"]),
    displayAllowed: z.boolean(),
    simulationAllowed: z.boolean(),
    replayAllowed: z.boolean(),
    retentionDays: z.number().int().min(0).max(3650),
    status: z.enum(["unknown", "blocked", "verified"]),
    checkedAt: catalogTimestamp,
    effectiveFrom: catalogTimestamp,
    expiresAt: catalogTimestamp,
    evidenceRef: z.string().min(8).max(255),
    blockingReason: z.string().min(10).max(300),
    actor: catalogActor,
  })
  .strict()
  .superRefine((value, context) => {
    const feeds = {
      listings: "reference",
      historical: "historical",
      eod: "eod",
      delayed: "delayed",
      live: "live",
    } as const;
    if (
      (value.capability in feeds &&
        value.feedType !== feeds[value.capability as keyof typeof feeds]) ||
      (value.feedType === "live" && value.expectedDelaySeconds !== 0) ||
      (value.feedType === "delayed" && value.expectedDelaySeconds === 0)
    )
      context.addIssue({
        code: "custom",
        message: "Feed freshness must match the declared capability",
      });
    if (
      Date.parse(value.expiresAt) <= Date.parse(value.effectiveFrom) ||
      Date.parse(value.expiresAt) <= Date.parse(value.checkedAt) ||
      new Set(value.listingIds).size !== value.listingIds.length ||
      (value.listingScope === "venue"
        ? value.listingIds.length !== 0
        : value.listingIds.length === 0) ||
      (value.status !== "verified" &&
        (value.displayAllowed ||
          value.simulationAllowed ||
          value.replayAllowed ||
          value.retentionDays > 0))
    )
      context.addIssue({
        code: "custom",
        message:
          "Capability scope, permission or effective period is inconsistent",
      });
  });
export type MarketCapability = z.infer<typeof capabilitySchema>;
export function capabilityAllowed(
  value: MarketCapability,
  at: Date,
  use: "display" | "simulation" | "replay" | "retention",
) {
  const parsed = capabilitySchema.safeParse(value);
  if (!parsed.success) return false;
  const row = parsed.data;
  const now = at.getTime();
  if (
    !Number.isFinite(now) ||
    row.status !== "verified" ||
    row.allowedAudience !== "public" ||
    Date.parse(row.checkedAt) > now ||
    Date.parse(row.effectiveFrom) > now ||
    Date.parse(row.expiresAt) <= now
  )
    return false;
  return use === "retention"
    ? row.retentionDays > 0
    : use === "display"
      ? row.displayAllowed
      : use === "simulation"
        ? row.simulationAllowed
        : row.replayAllowed;
}
