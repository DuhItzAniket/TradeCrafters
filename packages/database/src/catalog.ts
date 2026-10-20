import { randomUUID } from "node:crypto";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import {
  snapshotSchema,
  classificationSchema,
  capabilitySchema,
  catalogDate,
  micRecordSchema,
  diffCatalog,
  capabilityTypes,
  type CatalogSnapshot,
  type MicRecord,
  type MarketCapability,
} from "@tradecrafters/domain/catalog";
import { directorySource, micDirectory } from "@tradecrafters/market-catalog";
import { getPool } from "./pool";
import { policyHash } from "./policies";

async function audit(
  connection: PoolConnection,
  action: string,
  subject: string,
  actor: string,
  reason: string,
  detail: unknown,
) {
  await connection.execute(
    "INSERT INTO catalog_audit (id,action,subject,actor,reason,detail) VALUES (?,?,?,?,?,?)",
    [randomUUID(), action, subject, actor, reason, JSON.stringify(detail)],
  );
}
async function snapshotRows(
  connection: PoolConnection,
  id: string,
): Promise<MicRecord[]> {
  const [rows] = await connection.execute<RowDataPacket[]>(
    "SELECT v.definition,v.content_hash,m.mic,m.operating_mic,m.kind,m.name,m.country,m.city,m.category,m.source_status FROM mic_record_versions v JOIN mic_records m ON m.snapshot_id=v.snapshot_id AND m.mic=v.mic WHERE v.snapshot_id=? ORDER BY v.mic",
    [id],
  );
  return rows.map((row) => {
    const value = micRecordSchema.parse(row.definition);
    if (
      policyHash(value) !== row.content_hash ||
      value.mic !== row.mic ||
      value.operatingMic !== row.operating_mic ||
      value.kind !== row.kind ||
      value.name !== row.name ||
      value.country !== row.country ||
      value.city !== row.city ||
      value.category !== row.category ||
      value.status !== row.source_status
    )
      throw Error("CATALOG_INTEGRITY_FAILURE");
    return value;
  });
}
function snapshotHash(value: CatalogSnapshot) {
  return policyHash({
    publishedOn: value.publishedOn,
    changesEffectiveOn: value.changesEffectiveOn,
    sourceKind: value.sourceKind,
    sourceUrl: value.sourceUrl,
    parentSnapshot: value.parentSnapshot,
    records: [...value.records].sort((a, b) =>
      a.mic < b.mic ? -1 : a.mic > b.mic ? 1 : 0,
    ),
  });
}
export async function registerCatalogSnapshot(input: CatalogSnapshot) {
  const value = snapshotSchema.parse(input),
    hash = snapshotHash(value);
  const today = new Date().toISOString().slice(0, 10);
  if (
    value.sourceKind === "iso10383" &&
    (value.publishedOn > today || value.retrievedOn > today)
  )
    throw Error("INVALID_CATALOG_PUBLICATION");
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    // Monthly reference imports are serialized independently of accounts and trading.
    await connection.query(
      "SELECT id FROM catalog_import_guard WHERE id=1 FOR UPDATE",
    );
    const [existing] = await connection.execute<RowDataPacket[]>(
      "SELECT * FROM catalog_snapshots WHERE snapshot_id=? FOR UPDATE",
      [value.publishedOn],
    );
    if (existing.length) {
      if (existing[0].content_hash !== hash)
        throw Error("IMMUTABLE_CATALOG_SNAPSHOT");
      const stored = await snapshotRows(connection, value.publishedOn);
      if (
        stored.length !== value.records.length ||
        snapshotHash({ ...value, records: stored }) !== hash
      )
        throw Error("CATALOG_INTEGRITY_FAILURE");
      await connection.commit();
      return { snapshotId: value.publishedOn, changes: 0, reused: true };
    }
    let previous: MicRecord[] = [];
    if (value.parentSnapshot) {
      const [parents] = await connection.execute<RowDataPacket[]>(
        "SELECT source_kind,effective_from FROM catalog_snapshots WHERE snapshot_id=? FOR SHARE",
        [value.parentSnapshot],
      );
      if (
        !parents.length ||
        parents[0].source_kind !== value.sourceKind ||
        new Date(parents[0].effective_from).toISOString().slice(0, 10) >
          value.changesEffectiveOn
      )
        throw Error("INVALID_CATALOG_BASELINE");
      previous = await snapshotRows(connection, value.parentSnapshot);
    }
    await connection.execute(
      "INSERT INTO catalog_snapshots (snapshot_id,source_kind,effective_from,retrieved_on,source_url,content_hash,parent_snapshot,record_count) VALUES (?,?,?,?,?,?,?,?)",
      [
        value.publishedOn,
        value.sourceKind,
        value.changesEffectiveOn,
        value.retrievedOn,
        value.sourceUrl,
        hash,
        value.parentSnapshot,
        value.records.length,
      ],
    );
    for (let offset = 0; offset < value.records.length; offset += 100) {
      const batch = value.records.slice(offset, offset + 100);
      await connection.query(
        "INSERT INTO mic_records (snapshot_id,mic,operating_mic,kind,name,country,city,category,source_status) VALUES ? ON DUPLICATE KEY UPDATE snapshot_id=VALUES(snapshot_id)",
        [
          batch.map((row) => [
            value.publishedOn,
            row.mic,
            row.operatingMic,
            row.kind,
            row.name,
            row.country,
            row.city,
            row.category,
            row.status,
          ]),
        ],
      );
      await connection.query(
        "INSERT INTO mic_record_versions (snapshot_id,mic,definition,content_hash) VALUES ?",
        [
          batch.map((row) => [
            value.publishedOn,
            row.mic,
            JSON.stringify(row),
            policyHash(row),
          ]),
        ],
      );
    }
    // Check retained legacy projections too; an import must not bless conflicting rows.
    const stored = await snapshotRows(connection, value.publishedOn);
    const [counts] = await connection.execute<RowDataPacket[]>(
      "SELECT COUNT(*) AS count FROM mic_records WHERE snapshot_id=?",
      [value.publishedOn],
    );
    if (
      Number(counts[0].count) !== value.records.length ||
      snapshotHash({ ...value, records: stored }) !== hash
    )
      throw Error("CATALOG_INTEGRITY_FAILURE");
    const changes = value.parentSnapshot
      ? diffCatalog(previous, value.records)
      : [];
    if (changes.length)
      await connection.query(
        "INSERT INTO catalog_snapshot_changes (snapshot_id,mic,change_kind) VALUES ?",
        [changes.map((row) => [value.publishedOn, row.mic, row.kind])],
      );
    await audit(
      connection,
      "snapshot_register",
      `snapshot:${value.publishedOn}`,
      value.actor,
      value.reason,
      {
        hash,
        count: value.records.length,
        parent: value.parentSnapshot,
        initialBaseline: value.parentSnapshot === null,
        changes: changes.length,
      },
    );
    await connection.commit();
    return {
      snapshotId: value.publishedOn,
      changes: changes.length,
      reused: false,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function effectiveCatalogSnapshot(
  at = new Date(),
  sourceKind: "iso10383" | "test" = "iso10383",
) {
  const day = catalogDate.parse(at.toISOString().slice(0, 10));
  const [rows] = await getPool().execute<RowDataPacket[]>(
    "SELECT snapshot_id FROM catalog_snapshots WHERE source_kind=? AND effective_from<=? ORDER BY effective_from DESC,snapshot_id DESC LIMIT 1",
    [sourceKind, day],
  );
  return (rows[0]?.snapshot_id as string | undefined) ?? null;
}
export async function reviewVenueClassification(
  input: ReturnType<typeof classificationSchema.parse>,
  now = new Date(),
) {
  const value = classificationSchema.parse(input);
  const reviewed = Date.parse(value.reviewedAt),
    expires = Date.parse(value.expiresAt);
  if (
    reviewed > now.getTime() ||
    expires <= now.getTime() ||
    expires <= reviewed ||
    expires - reviewed > 366 * 86400000
  )
    throw Error("INVALID_CLASSIFICATION_PERIOD");
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<RowDataPacket[]>(
      "SELECT mic FROM mic_record_versions WHERE snapshot_id=? AND mic=? FOR UPDATE",
      [value.snapshotId, value.mic],
    );
    if (!rows.length) throw Error("VENUE_NOT_FOUND");
    const [before] = await connection.execute<RowDataPacket[]>(
      "SELECT classification,evidence_ref,reviewed_at,expires_at FROM venue_classifications WHERE snapshot_id=? AND mic=?",
      [value.snapshotId, value.mic],
    );
    if (before.length && new Date(before[0].reviewed_at).getTime() > reviewed)
      throw Error("STALE_CLASSIFICATION_REVIEW");
    if (
      before.length &&
      before[0].classification === value.classification &&
      before[0].evidence_ref === value.evidenceRef &&
      new Date(before[0].reviewed_at).toISOString() ===
        new Date(value.reviewedAt).toISOString() &&
      new Date(before[0].expires_at).toISOString() ===
        new Date(value.expiresAt).toISOString()
    ) {
      await connection.commit();
      return;
    }
    await connection.execute(
      "INSERT INTO venue_classifications (snapshot_id,mic,classification,evidence_ref,reviewed_at,expires_at) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE classification=VALUES(classification),evidence_ref=VALUES(evidence_ref),reviewed_at=VALUES(reviewed_at),expires_at=VALUES(expires_at)",
      [
        value.snapshotId,
        value.mic,
        value.classification,
        value.evidenceRef,
        new Date(value.reviewedAt),
        new Date(value.expiresAt),
      ],
    );
    await audit(
      connection,
      "classification_review",
      `venue:${value.snapshotId}:${value.mic}`,
      value.actor,
      value.reason,
      { before: before[0] ?? null, after: value },
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
export async function publishMarketCapability(
  input: MarketCapability,
  now = new Date(),
) {
  const value = capabilitySchema.parse(input);
  if (
    Date.parse(value.checkedAt) > now.getTime() ||
    Date.parse(value.expiresAt) <= now.getTime()
  )
    throw Error("INVALID_CAPABILITY_PERIOD");
  const id = policyHash(value),
    connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [venues] = await connection.execute<RowDataPacket[]>(
      "SELECT mic FROM mic_record_versions WHERE snapshot_id=? AND mic=? FOR UPDATE",
      [value.snapshotId, value.mic],
    );
    if (!venues.length) throw Error("VENUE_NOT_FOUND");
    for (const listingId of value.listingIds) {
      const [listing] = await connection.execute<RowDataPacket[]>(
        "SELECT l.id FROM listings l JOIN securities s ON s.id=l.security_id WHERE l.id=? AND l.mic=? AND s.fictional=false",
        [listingId, value.mic],
      );
      if (!listing.length) throw Error("CAPABILITY_LISTING_MISMATCH");
    }
    const [overlaps] = await connection.execute<RowDataPacket[]>(
      "SELECT id FROM market_capability_versions WHERE snapshot_id=? AND mic=? AND provider=? AND dataset=? AND capability=? AND effective_from<? AND effective_to>? FOR UPDATE",
      [
        value.snapshotId,
        value.mic,
        value.provider,
        value.dataset,
        value.capability,
        new Date(value.expiresAt),
        new Date(value.effectiveFrom),
      ],
    );
    if (overlaps.length === 1 && overlaps[0].id === id) {
      await connection.commit();
      return id;
    }
    if (overlaps.length) throw Error("OVERLAPPING_MARKET_CAPABILITY");
    await connection.execute(
      "INSERT INTO market_capability_versions (id,snapshot_id,mic,provider,dataset,capability,definition,effective_from,effective_to) VALUES (?,?,?,?,?,?,?,?,?)",
      [
        id,
        value.snapshotId,
        value.mic,
        value.provider,
        value.dataset,
        value.capability,
        JSON.stringify(value),
        new Date(value.effectiveFrom),
        new Date(value.expiresAt),
      ],
    );
    await audit(
      connection,
      "capability_publish",
      `capability:${value.snapshotId}:${value.mic}`,
      value.actor,
      value.blockingReason,
      {
        id,
        provider: value.provider,
        capability: value.capability,
        status: value.status,
      },
    );
    await connection.commit();
    return id;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function catalogCoverage() {
  const reference = await catalogReference();
  const classification = await classificationCounts(reference.publishedOn);
  const [evidence] = await getPool().execute<RowDataPacket[]>(
    "SELECT definition,id FROM market_capability_versions WHERE snapshot_id=? AND effective_from<=UTC_TIMESTAMP(3) AND effective_to>UTC_TIMESTAMP(3)",
    [reference.publishedOn],
  );
  const evidenceCounts = new Map<string, number>();
  for (const row of evidence) {
    const parsed = capabilitySchema.safeParse(row.definition);
    if (parsed.success && policyHash(parsed.data) === row.id)
      evidenceCounts.set(
        parsed.data.capability,
        (evidenceCounts.get(parsed.data.capability) ?? 0) + 1,
      );
  }
  return {
    referenceSnapshot: reference.publishedOn,
    referenceEffectiveFrom: reference.changesEffectiveOn,
    effectiveSnapshot: await effectiveCatalogSnapshot(),
    totalReferenceRecords: Object.values(classification).reduce(
      (a, b) => a + b,
      0,
    ),
    classification,
    universeReviewComplete: false,
    realSimulationEnabled: 0,
    capabilities: capabilityTypes.map((capability) => ({
      capability,
      executionStatus: "disabled" as const,
      evidenceRecords: evidenceCounts.get(capability) ?? 0,
      enabledVenues: 0,
    })),
    gapTracker: "https://github.com/DuhItzAniket/TradeCrafters/issues/9",
  };
}
export async function classificationCounts(
  snapshotId: string,
  at = new Date(),
) {
  catalogDate.parse(snapshotId);
  const [counts] = await getPool().execute<RowDataPacket[]>(
    "SELECT CASE WHEN c.reviewed_at<=? AND c.expires_at>? THEN c.classification ELSE 'unknown' END AS classification,COUNT(*) AS count FROM mic_records m LEFT JOIN venue_classifications c ON c.snapshot_id=m.snapshot_id AND c.mic=m.mic WHERE m.snapshot_id=? GROUP BY 1",
    [at, at, snapshotId],
  );
  const classification = { cash_equity: 0, other_facility: 0, unknown: 0 };
  for (const row of counts)
    classification[row.classification as keyof typeof classification] = Number(
      row.count,
    );
  return classification;
}
export async function catalogReference() {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT snapshot_id,DATE_FORMAT(effective_from,'%Y-%m-%d') AS effective,DATE_FORMAT(retrieved_on,'%Y-%m-%d') AS retrieved,source_url,record_count FROM catalog_snapshots WHERE source_kind='iso10383' AND snapshot_id<=DATE_FORMAT(UTC_DATE(),'%Y-%m-%d') ORDER BY snapshot_id DESC LIMIT 1",
  );
  if (!rows.length) throw Error("CATALOG_NOT_INITIALIZED");
  const row = rows[0];
  return {
    publisher: directorySource.publisher,
    url: directorySource.url,
    downloadUrl: row.source_url as string,
    publishedOn: row.snapshot_id as string,
    changesEffectiveOn: row.effective as string,
    retrievedOn: row.retrieved as string,
    records: Number(row.record_count),
  };
}
export async function seedCatalogSnapshot() {
  return registerCatalogSnapshot({
    publishedOn: directorySource.publishedOn,
    changesEffectiveOn: directorySource.changesEffectiveOn,
    retrievedOn: directorySource.retrievedOn,
    sourceKind: "iso10383",
    sourceUrl: directorySource.downloadUrl,
    parentSnapshot: null,
    records: micDirectory.map((row) => micRecordSchema.parse(row)),
    actor: "fixture-seed",
    reason:
      "Register official ISO MIC reference without granting real simulation coverage",
  });
}
