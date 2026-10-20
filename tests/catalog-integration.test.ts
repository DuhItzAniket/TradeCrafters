import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { getPool, closePool } from "@tradecrafters/database";
import {
  registerCatalogSnapshot,
  effectiveCatalogSnapshot,
  reviewVenueClassification,
  publishMarketCapability,
  classificationCounts,
  seedCatalogSnapshot,
} from "@tradecrafters/database/catalog";
import type {
  CatalogSnapshot,
  MicRecord,
  MarketCapability,
} from "@tradecrafters/domain/catalog";
const scope = `catalog-it-${randomUUID()}`;
const seed = Number.parseInt(scope.slice(-8), 16);
const first = `${1500 + (seed % 400)}-${String(1 + (seed % 12)).padStart(2, "0")}-01`;
const add = (date: string, days: number) =>
  new Date(Date.parse(date + "T00:00:00Z") + days * 86400000)
    .toISOString()
    .slice(0, 10);
const next = add(first, 14);
const operating: MicRecord = {
  mic: "ZAAA",
  operatingMic: "ZAAA",
  kind: "OPRT",
  name: "Disposable catalog operating venue",
  category: "RMKT",
  country: "ZZ",
  city: "Fixture",
  status: "ACTIVE",
  created: "15000101",
  updated: "15000101",
  expires: "",
};
const segment: MicRecord = { ...operating, mic: "ZAA1", kind: "SGMT" };
const initial: CatalogSnapshot = {
  publishedOn: first,
  changesEffectiveOn: add(first, 7),
  retrievedOn: first,
  sourceKind: "test",
  sourceUrl: "https://example.test/catalog",
  parentSnapshot: null,
  records: [operating, segment],
  actor: scope,
  reason: "Disposable reference fixture; no real venue assertions",
};
const changed: CatalogSnapshot = {
  ...initial,
  publishedOn: next,
  changesEffectiveOn: add(next, 7),
  retrievedOn: next,
  parentSnapshot: first,
  records: [
    { ...operating, name: "Renamed disposable venue" },
    { ...segment, mic: "ZAA2" },
  ],
};
const now = new Date();
const reviewedAt = new Date(now.getTime() - 1000).toISOString();
const expiresAt = new Date(now.getTime() + 86400000).toISOString();
const base = process.env.BETTER_AUTH_URL || "http://127.0.0.1:3000";
before(() => {
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
  assert.ok(
    ["localhost", "127.0.0.1", "mysql"].includes(
      new URL(process.env.DATABASE_URL!).hostname,
    ),
  );
});
after(async () => {
  try {
    await getPool().execute("DELETE FROM catalog_audit WHERE actor=?", [scope]);
    for (const id of [next, first]) {
      await getPool().execute(
        "DELETE FROM market_capability_versions WHERE snapshot_id=? AND JSON_UNQUOTE(JSON_EXTRACT(definition,'$.actor'))=?",
        [id, scope],
      );
      await getPool().execute(
        "DELETE FROM venue_classifications WHERE snapshot_id=?",
        [id],
      );
      await getPool().execute(
        "DELETE FROM catalog_snapshot_changes WHERE snapshot_id=?",
        [id],
      );
      await getPool().execute(
        "DELETE FROM mic_record_versions WHERE snapshot_id=?",
        [id],
      );
      await getPool().execute("DELETE FROM mic_records WHERE snapshot_id=?", [
        id,
      ]);
      await getPool().execute(
        "DELETE FROM catalog_snapshots WHERE snapshot_id=? AND source_kind='test'",
        [id],
      );
    }
  } finally {
    await closePool();
  }
});
test("concurrent reference imports are immutable and audited exactly once", async () => {
  const values = await Promise.all(
    Array.from({ length: 4 }, () => registerCatalogSnapshot(initial)),
  );
  assert.equal(values.filter((row) => !row.reused).length, 1);
  const [audit] = await getPool().execute<RowDataPacket[]>(
    "SELECT COUNT(*) AS count FROM catalog_audit WHERE action='snapshot_register' AND actor=?",
    [scope],
  );
  assert.equal(Number(audit[0].count), 1);
  await assert.rejects(
    registerCatalogSnapshot({
      ...initial,
      records: [{ ...operating, name: "Conflicting replacement" }, segment],
    }),
    /IMMUTABLE_CATALOG_SNAPSHOT/,
  );
});
test("snapshot diffs preserve old identities and reject premature effective-state promotion", async () => {
  const published = await registerCatalogSnapshot(changed);
  assert.equal(published.changes, 3);
  const [changes] = await getPool().execute<RowDataPacket[]>(
    "SELECT mic,change_kind AS kind FROM catalog_snapshot_changes WHERE snapshot_id=? ORDER BY mic",
    [next],
  );
  assert.deepEqual(
    changes.map((row) => ({ mic: row.mic, kind: row.kind })),
    [
      { mic: "ZAA1", kind: "removed" },
      { mic: "ZAA2", kind: "added" },
      { mic: "ZAAA", kind: "changed" },
    ],
  );
  assert.equal(
    await effectiveCatalogSnapshot(
      new Date(add(first, 6) + "T23:59:59Z"),
      "test",
    ),
    null,
  );
  assert.equal(
    await effectiveCatalogSnapshot(
      new Date(add(first, 7) + "T00:00:00Z"),
      "test",
    ),
    first,
  );
  assert.equal(
    await effectiveCatalogSnapshot(
      new Date(add(next, 6) + "T23:59:59Z"),
      "test",
    ),
    first,
  );
  assert.equal(
    await effectiveCatalogSnapshot(
      new Date(add(next, 7) + "T00:00:00Z"),
      "test",
    ),
    next,
  );
  const [old] = await getPool().execute<RowDataPacket[]>(
    "SELECT name FROM mic_records WHERE snapshot_id=? AND mic='ZAAA'",
    [first],
  );
  assert.equal(old[0].name, operating.name);
});
test("classification reviews are dated, auditable and expire back to unknown without omitting records", async () => {
  const review = {
    snapshotId: first,
    mic: operating.mic,
    classification: "cash_equity" as const,
    evidenceRef: "https://example.test/fictional-equity-evidence",
    reviewedAt,
    expiresAt,
    actor: scope,
    reason: "Disposable classification; not real exchange evidence",
  };
  await reviewVenueClassification(review, now);
  await reviewVenueClassification(review, now);
  assert.deepEqual(await classificationCounts(first, now), {
    cash_equity: 1,
    other_facility: 0,
    unknown: 1,
  });
  assert.deepEqual(await classificationCounts(first, new Date(expiresAt)), {
    cash_equity: 0,
    other_facility: 0,
    unknown: 2,
  });
  await assert.rejects(
    reviewVenueClassification(
      { ...review, reviewedAt: new Date(now.getTime() - 2000).toISOString() },
      now,
    ),
    /STALE_CLASSIFICATION_REVIEW/,
  );
  await assert.rejects(
    reviewVenueClassification(
      { ...review, reviewedAt: new Date(now.getTime() + 1000).toISOString() },
      now,
    ),
    /INVALID_CLASSIFICATION_PERIOD/,
  );
  await assert.rejects(
    reviewVenueClassification({ ...review, mic: "NONE" }, now),
    /VENUE_NOT_FOUND/,
  );
  const [audit] = await getPool().execute<RowDataPacket[]>(
    "SELECT COUNT(*) AS count FROM catalog_audit WHERE action='classification_review' AND actor=?",
    [scope],
  );
  assert.equal(Number(audit[0].count), 1);
});
test("provider capability records are scoped, non-overlapping, idempotent and never grant fictional listing rights", async () => {
  const capability: MarketCapability = {
    snapshotId: first,
    mic: operating.mic,
    provider: "test-provider",
    dataset: "dataset-v1",
    listingScope: "venue",
    listingIds: [],
    capability: "eod",
    assetClass: "cash_equity",
    feedType: "eod",
    expectedDelaySeconds: 86400,
    allowedAudience: "public",
    displayAllowed: false,
    simulationAllowed: false,
    replayAllowed: false,
    retentionDays: 0,
    status: "unknown",
    checkedAt: reviewedAt,
    effectiveFrom: reviewedAt,
    expiresAt,
    evidenceRef: "private-test-evidence-reference",
    blockingReason:
      "Fixture only; no real provider permissions have been asserted",
    actor: scope,
  };
  const ids = await Promise.all(
    Array.from({ length: 4 }, () => publishMarketCapability(capability, now)),
  );
  assert.equal(new Set(ids).size, 1);
  await assert.rejects(
    publishMarketCapability({ ...capability, status: "blocked" }, now),
    /OVERLAPPING_MARKET_CAPABILITY/,
  );
  await assert.rejects(
    publishMarketCapability(
      {
        ...capability,
        listingScope: "selected_listings",
        listingIds: ["sim-xtks-hikari"],
      },
      now,
    ),
    /CAPABILITY_LISTING_MISMATCH/,
  );
  await assert.rejects(
    publishMarketCapability(
      {
        ...capability,
        checkedAt: new Date(now.getTime() + 1000).toISOString(),
      },
      now,
    ),
    /INVALID_CAPABILITY_PERIOD/,
  );
});
test("corrupted stored reference content fails integrity checks and is never blessed by a repeat seed", async () => {
  await getPool().execute(
    "UPDATE mic_record_versions SET definition=JSON_SET(definition,'$.name','Corrupt name') WHERE snapshot_id=? AND mic=?",
    [first, operating.mic],
  );
  try {
    await assert.rejects(
      registerCatalogSnapshot(initial),
      /CATALOG_INTEGRITY_FAILURE/,
    );
  } finally {
    await getPool().execute(
      "UPDATE mic_record_versions SET definition=? WHERE snapshot_id=? AND mic=?",
      [JSON.stringify(operating), first, operating.mic],
    );
  }
  await getPool().execute(
    "UPDATE catalog_snapshots SET effective_from=? WHERE snapshot_id=?",
    [first, first],
  );
  try {
    await assert.rejects(
      registerCatalogSnapshot(initial),
      /IMMUTABLE_CATALOG_SNAPSHOT/,
    );
  } finally {
    await getPool().execute(
      "UPDATE catalog_snapshots SET effective_from=? WHERE snapshot_id=?",
      [initial.changesEffectiveOn, first],
    );
  }
  await getPool().execute(
    "INSERT INTO mic_records (snapshot_id,mic,operating_mic,kind,name,country,city,category,source_status) VALUES (?,'ZAXX','ZAXX','OPRT','Unversioned fixture','ZZ','Fixture','RMKT','ACTIVE')",
    [first],
  );
  try {
    await assert.rejects(
      registerCatalogSnapshot(initial),
      /CATALOG_INTEGRITY_FAILURE/,
    );
  } finally {
    await getPool().execute(
      "DELETE FROM mic_records WHERE snapshot_id=? AND mic='ZAXX'",
      [first],
    );
  }
});
test("the public coverage and classification filters account for the entire reference without enabling real data", async () => {
  const response = await fetch(`${base}/api/catalog/coverage`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const result = await response.json();
  assert.equal(result.totalReferenceRecords, 2889);
  assert.equal(
    result.classification.cash_equity +
      result.classification.other_facility +
      result.classification.unknown,
    2889,
  );
  assert.equal(result.universeReviewComplete, false);
  assert.equal(result.realSimulationEnabled, 0);
  assert.equal(result.capabilities.length, 9);
  assert.ok(
    result.capabilities.every(
      (row: { enabledVenues: number; executionStatus: string }) =>
        row.enabledVenues === 0 && row.executionStatus === "disabled",
    ),
  );
  const totals = await Promise.all(
    ["cash_equity", "other_facility", "unknown"].map(async (classification) => {
      const data = await (
        await fetch(`${base}/api/directory?classification=${classification}`)
      ).json();
      assert.ok(
        data.records.every(
          (row: { classification: string }) =>
            row.classification === classification,
        ),
      );
      return data.total as number;
    }),
  );
  assert.equal(
    totals.reduce((a, b) => a + b, 0),
    2889,
  );
  assert.equal(
    (await fetch(`${base}/api/catalog/coverage?at=2099-01-01`)).status,
    400,
  );
  assert.equal(
    (await fetch(`${base}/api/catalog/coverage`, { method: "POST" })).status,
    405,
  );
});
test("repeat source seeds preserve hashes, records and the initial-baseline distinction", async () => {
  assert.equal((await seedCatalogSnapshot()).reused, true);
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT COUNT(*) AS count FROM mic_record_versions WHERE snapshot_id='2026-10-12'",
  );
  assert.equal(Number(rows[0].count), 2889);
  const [changes] = await getPool().query<RowDataPacket[]>(
    "SELECT COUNT(*) AS count FROM catalog_snapshot_changes WHERE snapshot_id='2026-10-12'",
  );
  assert.equal(Number(changes[0].count), 0);
});
