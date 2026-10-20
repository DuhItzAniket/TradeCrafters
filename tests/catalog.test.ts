import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aliasAssignmentSchema,
  aliasLookupSchema,
  datesOverlap,
  snapshotSchema,
  diffCatalog,
  capabilitySchema,
  capabilityAllowed,
  type MarketCapability,
  type MicRecord,
} from "@tradecrafters/domain/catalog";

test("provider aliases preserve case and namespace and reject unbounded or ambiguous input", () => {
  const valid = {
    listingId: "listing-1",
    provider: "vendor-1",
    alias: "Ab.C/DE",
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    actor: "operator-cli",
    reason: "Verified mapping publication",
  };
  assert.equal(aliasAssignmentSchema.parse(valid).alias, "Ab.C/DE");
  for (const change of [
    { provider: "Vendor" },
    { alias: " a" },
    { alias: "A?date=1" },
    { effectiveFrom: "2026-02-30" },
    { effectiveTo: "2026-01-01" },
    { effectiveTo: "2025-12-31" },
    { listingId: "a".repeat(65) },
    { userId: "forged" },
  ]) {
    assert.equal(
      aliasAssignmentSchema.safeParse({ ...valid, ...change }).success,
      false,
    );
  }
  assert.equal(
    aliasLookupSchema.safeParse({
      provider: "vendor-1",
      alias: "A",
      at: "2020-01-01",
    }).success,
    false,
  );
});

const operating: MicRecord = {
  mic: "XAAA",
  operatingMic: "XAAA",
  kind: "OPRT",
  name: "Fixture operating market",
  category: "RMKT",
  country: "ZZ",
  city: "Fixture",
  status: "ACTIVE",
  created: "20260101",
  updated: "20260101",
  expires: "",
};
test("snapshot contracts require complete identity relationships and valid publication dates", () => {
  const input = {
    publishedOn: "2026-01-01",
    changesEffectiveOn: "2026-01-05",
    retrievedOn: "2026-01-02",
    sourceKind: "test",
    sourceUrl: "https://example.test/source",
    parentSnapshot: null,
    records: [operating],
    actor: "test",
    reason: "Disposable reference fixture",
  };
  assert.equal(snapshotSchema.safeParse(input).success, true);
  assert.equal(
    snapshotSchema.safeParse({
      ...input,
      records: [operating, { ...operating, mic: "XAA1", kind: "SGMT" }],
    }).success,
    true,
  );
  assert.equal(
    snapshotSchema.safeParse({
      ...input,
      records: [
        operating,
        { ...operating, mic: "XAA2", kind: "SGMT" },
        {
          ...operating,
          mic: "XAA1",
          operatingMic: "XAA2",
          kind: "SGMT",
          status: "EXPIRED",
          expires: "20260101",
        },
      ],
    }).success,
    true,
    "expired source references remain visible when a former operator is now a segment",
  );
  for (const records of [
    [operating, operating],
    [{ ...operating, operatingMic: "NONE" }],
    [{ ...operating, created: "20260230" }],
    [{ ...operating, kind: "SGMT", operatingMic: "NONE" }],
    [{ ...operating, kind: "SGMT" }],
    [{ ...operating, kind: "SGMT", status: "EXPIRED" }],
    [
      operating,
      { ...operating, mic: "XAA1", kind: "SGMT", operatingMic: "XAA2" },
      { ...operating, mic: "XAA2", kind: "SGMT" },
    ],
  ])
    assert.equal(
      snapshotSchema.safeParse({ ...input, records }).success,
      false,
    );
  assert.equal(
    snapshotSchema.safeParse({ ...input, changesEffectiveOn: "2025-12-31" })
      .success,
    false,
  );
  assert.equal(
    snapshotSchema.safeParse({ ...input, parentSnapshot: "2026-01-01" })
      .success,
    false,
  );
});
test("snapshot diffs retain explicit added, removed and changed MICs regardless of row/key order", () => {
  const segment: MicRecord = { ...operating, mic: "XAA1", kind: "SGMT" };
  assert.deepEqual(
    diffCatalog(
      [segment, operating],
      [
        { ...operating, name: "Renamed market" },
        { ...segment, mic: "XAA2" },
      ],
    ),
    [
      { mic: "XAA1", kind: "removed" },
      { mic: "XAA2", kind: "added" },
      { mic: "XAAA", kind: "changed" },
    ],
  );
  assert.deepEqual(diffCatalog([operating, segment], [segment, operating]), []);
});
const capability: MarketCapability = {
  snapshotId: "2026-01-01",
  mic: "XAAA",
  provider: "test-provider",
  dataset: "test-dataset",
  listingScope: "venue",
  listingIds: [],
  capability: "delayed",
  assetClass: "cash_equity",
  feedType: "delayed",
  expectedDelaySeconds: 900,
  allowedAudience: "public",
  displayAllowed: true,
  simulationAllowed: false,
  replayAllowed: false,
  retentionDays: 0,
  status: "verified",
  checkedAt: "2026-01-01T00:00:00Z",
  effectiveFrom: "2026-01-01T00:00:00Z",
  expiresAt: "2026-02-01T00:00:00Z",
  evidenceRef: "private-evidence-reference",
  blockingReason: "Disposable test declaration; simulation prohibited",
  actor: "test",
};
test("capability contracts keep delayed/live feeds, scope, audience and allowed uses distinct", () => {
  assert.equal(capabilitySchema.safeParse(capability).success, true);
  for (const change of [
    { capability: "live" },
    { expectedDelaySeconds: 0 },
    { status: "unknown" },
    { listingScope: "selected_listings" },
    { expiresAt: "2026-01-01T00:00:00Z" },
    { checkedAt: "2026-01-01T00:00:00.000001Z" },
  ])
    assert.equal(
      capabilitySchema.safeParse({ ...capability, ...change }).success,
      false,
    );
  const at = new Date("2026-01-15T00:00:00Z");
  assert.equal(capabilityAllowed(capability, at, "display"), true);
  for (const use of ["simulation", "replay", "retention"] as const)
    assert.equal(capabilityAllowed(capability, at, use), false);
  assert.equal(
    capabilityAllowed(
      { ...capability, allowedAudience: "private" },
      at,
      "display",
    ),
    false,
  );
});
test("capability permission rejects unknown, blocked, future, expired and invalid-clock use", () => {
  assert.equal(
    capabilityAllowed(capability, new Date("2026-02-01T00:00:00Z"), "display"),
    false,
  );
  assert.equal(
    capabilityAllowed(capability, new Date("2025-12-31T23:59:59Z"), "display"),
    false,
  );
  assert.equal(capabilityAllowed(capability, new Date(NaN), "display"), false);
  for (const status of ["unknown", "blocked"] as const)
    assert.equal(
      capabilityAllowed(
        { ...capability, status, displayAllowed: false },
        new Date("2026-01-15Z"),
        "display",
      ),
      false,
    );
});
test("alias date windows have inclusive starts, exclusive ends and open-ended coverage", () => {
  const early = { effectiveFrom: "2026-01-01", effectiveTo: "2026-07-01" };
  assert.equal(
    datesOverlap(early, { effectiveFrom: "2026-07-01", effectiveTo: null }),
    false,
  );
  assert.equal(
    datesOverlap(early, { effectiveFrom: "2026-06-30", effectiveTo: null }),
    true,
  );
  assert.equal(
    datesOverlap(
      { ...early, effectiveTo: null },
      { effectiveFrom: "2099-01-01", effectiveTo: null },
    ),
    true,
  );
});
