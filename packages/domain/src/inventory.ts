import { createHash } from "node:crypto";
import { z } from "zod";
import {
  catalogDate,
  catalogTimestamp,
  catalogActor,
  catalogReason,
  classificationSchema,
  micRecordSchema,
  type MicRecord,
} from "./catalog";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const evidenceUrl = z
  .string()
  .url()
  .max(255)
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  });
const reviewSchema = z
  .object({
    mic: z.string().regex(/^[A-Z0-9]{4}$/),
    identityHash: digest,
    classification: z.enum(["cash_equity", "other_facility", "unknown"]),
    scope: z.enum([
      "operating_contains_cash_equity",
      "cash_equity_segment",
      "derivatives_segment",
      "reporting_service",
      "unresolved",
    ]),
    region: z.enum([
      "Africa",
      "Americas",
      "Asia",
      "Europe",
      "Middle East",
      "Oceania",
    ]),
    evidenceRef: evidenceUrl,
    evidenceSummary: z.string().min(20).max(500),
    access: z.enum(["retrieved_primary", "indexed_primary_only"]),
    reason: catalogReason,
    followUp: catalogReason,
  })
  .strict();
export const inventoryReviewSchema = z
  .object({
    version: z.literal(1),
    snapshotId: catalogDate,
    changesEffectiveOn: catalogDate,
    sourceHash: digest,
    sourceRecordCount: z.number().int().min(1).max(10000),
    reviewedAt: catalogTimestamp,
    expiresAt: catalogTimestamp,
    actor: catalogActor,
    reviews: z.array(reviewSchema).min(1).max(1000),
    supplemental: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z][a-z0-9-]{2,63}$/),
            name: z.string().min(4).max(255),
            country: z.string().regex(/^[A-Z]{2}$/),
            evidenceRef: evidenceUrl,
            evidenceSummary: z.string().min(20).max(500),
            referenceCountryRecords: z.number().int().min(0).max(10000),
            status: z.literal("mic_mapping_unresolved"),
            followUp: catalogReason,
          })
          .strict(),
      )
      .max(1000),
  })
  .strict();
export type InventoryReview = z.infer<typeof inventoryReviewSchema>;
export function micIdentityHash(row: MicRecord) {
  return createHash("sha256")
    .update(JSON.stringify(micRecordSchema.parse(row)))
    .digest("hex");
}
export function inventorySourceHash(rows: MicRecord[]) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        [...rows]
          .sort((a, b) => (a.mic < b.mic ? -1 : a.mic > b.mic ? 1 : 0))
          .map((row) => micRecordSchema.parse(row)),
      ),
    )
    .digest("hex");
}
export function validateInventoryReview(
  input: unknown,
  records: MicRecord[],
  source: { publishedOn: string; changesEffectiveOn: string },
) {
  const value = inventoryReviewSchema.parse(input);
  const byMic = new Map(records.map((row) => [row.mic, row]));
  if (
    byMic.size !== records.length ||
    value.snapshotId !== source.publishedOn ||
    value.changesEffectiveOn !== source.changesEffectiveOn ||
    value.sourceRecordCount !== records.length ||
    value.sourceHash !== inventorySourceHash(records) ||
    new Set(value.reviews.map((row) => row.mic)).size !==
      value.reviews.length ||
    new Set(value.supplemental.map((row) => row.id)).size !==
      value.supplemental.length ||
    Date.parse(value.expiresAt) <= Date.parse(value.reviewedAt) ||
    Date.parse(value.expiresAt) - Date.parse(value.reviewedAt) > 366 * 86400000
  )
    throw Error("INVALID_INVENTORY_REVIEW");
  for (const review of value.reviews) {
    const row = byMic.get(review.mic);
    const expected =
      review.scope === "unresolved"
        ? "unknown"
        : ["reporting_service", "derivatives_segment"].includes(review.scope)
          ? "other_facility"
          : "cash_equity";
    if (
      !row ||
      review.identityHash !== micIdentityHash(row) ||
      review.classification !== expected ||
      (review.classification !== "unknown" && row.status === "EXPIRED") ||
      (review.scope === "operating_contains_cash_equity" &&
        row.kind !== "OPRT") ||
      (["cash_equity_segment", "derivatives_segment"].includes(review.scope) &&
        row.kind !== "SGMT") ||
      (review.access === "indexed_primary_only" &&
        review.classification !== "unknown")
    )
      throw Error("INVALID_INVENTORY_IDENTITY");
  }
  for (const row of value.supplemental)
    if (
      records.filter((record) => record.country === row.country).length !==
      row.referenceCountryRecords
    )
      throw Error("INVALID_INVENTORY_GAP");
  return value;
}
export function inventoryAssessment(
  input: unknown,
  records: MicRecord[],
  source: { publishedOn: string; changesEffectiveOn: string },
  at: Date,
) {
  const value = validateInventoryReview(input, records, source);
  if (!Number.isFinite(at.getTime())) throw Error("INVALID_INVENTORY_CLOCK");
  const state =
    at.getTime() < Date.parse(value.reviewedAt)
      ? "future"
      : at.getTime() >= Date.parse(value.expiresAt)
        ? "expired"
        : "current";
  const reviews = new Map(value.reviews.map((row) => [row.mic, row]));
  const counts = { cash_equity: 0, other_facility: 0, unknown: 0 };
  const rows = [...records]
    .sort((a, b) => (a.mic < b.mic ? -1 : a.mic > b.mic ? 1 : 0))
    .map((row) => {
      const review = reviews.get(row.mic);
      const classification =
        state === "current" && review ? review.classification : "unknown";
      counts[classification]++;
      return {
        ...row,
        classification,
        reviewState: review ? state : "unreviewed",
        evidenceRef: review?.evidenceRef ?? "",
        reviewedAt: review ? value.reviewedAt : "",
        expiresAt: review ? value.expiresAt : "",
        scope: review?.scope ?? "unresolved",
      };
    });
  return {
    review: value,
    asOf: at.toISOString(),
    reviewState: state,
    referenceEffective:
      at.toISOString().slice(0, 10) >= value.changesEffectiveOn,
    totalReferenceRecords: rows.length,
    counts,
    reviewedRows: value.reviews.length,
    cashEquityOperatingGroups: new Set(
      rows
        .filter((row) => row.classification === "cash_equity")
        .map((row) => row.operatingMic),
    ).size,
    supplementalCandidates: value.supplemental.length,
    universeReviewComplete: false,
    realSimulationEnabled: 0,
    rows,
  };
}
export function inventoryClassificationInputs(value: InventoryReview) {
  return value.reviews.map((row) =>
    classificationSchema.parse({
      snapshotId: value.snapshotId,
      mic: row.mic,
      classification: row.classification,
      evidenceRef: row.evidenceRef,
      reviewedAt: value.reviewedAt,
      expiresAt: value.expiresAt,
      actor: value.actor,
      reason: row.reason,
    }),
  );
}
