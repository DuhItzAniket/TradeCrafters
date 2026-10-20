import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { getPool, closePool } from "@tradecrafters/database";
import {
  publishListingPolicy,
  listingPolicy,
} from "@tradecrafters/database/policies";
import {
  fictionalPolicy,
  seedMarketPolicies,
} from "../packages/database/src/policy-fixtures";
import { scenarios } from "@tradecrafters/market-catalog/scenarios";
const base = process.env.BETTER_AUTH_URL || "http://127.0.0.1:3000";
const listingId = `policy-it-${randomUUID()}`;
const securityId = `security-${randomUUID()}`;
const fixture = fictionalPolicy(scenarios[3]);
fixture.listingId = listingId as typeof fixture.listingId;
fixture.calendar.id = `${listingId}-calendar`;
fixture.calendar.exceptions = [];
fixture.rules.id = `${listingId}-rules-v1`;
fixture.effectiveTo = "2026-07-01T00:00:00.000Z";
before(async () => {
  assert.ok(["127.0.0.1", "localhost"].includes(new URL(base).hostname));
  assert.ok(
    ["127.0.0.1", "localhost", "mysql"].includes(
      new URL(process.env.DATABASE_URL!).hostname,
    ),
  );
  const pool = getPool();
  await pool.execute(
    "INSERT INTO securities (id,name,fictional) VALUES (?,'Disposable policy fixture',true)",
    [securityId],
  );
  await pool.execute(
    "INSERT INTO listings (id,security_id,mic,symbol,settlement_currency,quote_unit,unit_numerator,unit_denominator,timezone,fixture_policy) VALUES (?,?,'XTKS',?,'JPY','JPY',1,1,'Asia/Tokyo',JSON_OBJECT())",
    [listingId, securityId, `IT-${randomUUID().slice(0, 8)}`],
  );
});
after(async () => {
  const pool = getPool();
  try {
    const [versions] = await pool.execute<RowDataPacket[]>(
      "SELECT calendar_id,rule_id FROM listing_policy_versions WHERE listing_id=?",
      [listingId],
    );
    await pool.execute("DELETE FROM listing_halts WHERE listing_id=?", [
      listingId,
    ]);
    await pool.execute(
      "DELETE a FROM catalog_policy_audit a JOIN listing_policy_versions p ON p.id=a.policy_id WHERE p.listing_id=?",
      [listingId],
    );
    await pool.execute(
      "DELETE a FROM listing_policy_permissions a JOIN listing_policy_versions p ON p.id=a.policy_id WHERE p.listing_id=?",
      [listingId],
    );
    await pool.execute(
      "DELETE FROM listing_policy_versions WHERE listing_id=?",
      [listingId],
    );
    await pool.execute("DELETE FROM listings WHERE id=?", [listingId]);
    await pool.execute("DELETE FROM securities WHERE id=?", [securityId]);
    for (const id of new Set(versions.map((row) => row.calendar_id)))
      await pool.execute("DELETE FROM market_calendar_versions WHERE id=?", [
        id,
      ]);
    for (const id of new Set(versions.map((row) => row.rule_id)))
      await pool.execute("DELETE FROM trading_rule_versions WHERE id=?", [id]);
  } finally {
    await closePool();
  }
});
test("concurrent publication is idempotent, audited once and rejects overlapping assignments", async () => {
  const ids = await Promise.all(
    Array.from({ length: 8 }, () => publishListingPolicy(fixture)),
  );
  assert.equal(new Set(ids).size, 1);
  const [rows] = await getPool().execute<RowDataPacket[]>(
    "SELECT COUNT(*) AS count FROM catalog_policy_audit a JOIN listing_policy_versions p ON p.id=a.policy_id WHERE p.listing_id=?",
    [listingId],
  );
  assert.equal(Number(rows[0].count), 1);
  await assert.rejects(
    publishListingPolicy({
      ...fixture,
      rules: { ...fixture.rules, id: `${listingId}-other`, boardLot: "10" },
    }),
    /OVERLAPPING_POLICY_ASSIGNMENT/,
  );
  await assert.rejects(
    publishListingPolicy({
      ...fixture,
      calendar: { ...fixture.calendar, timezone: "UTC" },
    }),
    /LISTING_POLICY_MISMATCH/,
  );
});
test("immutable policy content and adjacent effective versions preserve dated decisions", async () => {
  await assert.rejects(
    publishListingPolicy({
      ...fixture,
      effectiveFrom: fixture.effectiveTo,
      effectiveTo: "2027-01-01T00:00:00.000Z",
      rules: { ...fixture.rules, boardLot: "10" },
    }),
    /IMMUTABLE_POLICY_VERSION/,
  );
  const next = {
    ...fixture,
    effectiveFrom: fixture.effectiveTo,
    effectiveTo: "2027-01-01T00:00:00.000Z",
    rules: { ...fixture.rules, id: `${listingId}-rules-v2`, boardLot: "10" },
    permissions: {
      ...fixture.permissions,
      expiresAt: "2026-08-01T00:00:00.000Z",
    },
  };
  await publishListingPolicy(next);
  const old = await listingPolicy(listingId, new Date("2026-06-30T01:00:00Z"));
  const current = await listingPolicy(
    listingId,
    new Date("2026-07-01T01:00:00Z"),
  );
  assert.equal(old?.policy?.rules.boardLot, "100");
  assert.equal(current?.policy?.rules.boardLot, "10");
  assert.equal(current?.sessionEligible, true);
  assert.equal(
    (await listingPolicy(listingId, new Date("2026-08-01T00:00:00Z")))?.code,
    "PERMISSION_REQUIRED",
  );
  assert.equal(
    (await listingPolicy(listingId, new Date("2027-01-01T00:00:00Z")))?.code,
    "POLICY_MISSING",
  );
  assert.equal(
    (await listingPolicy(listingId, new Date("2026-06-30T01:00:00Z"), "real"))
      ?.code,
    "MODE_MISMATCH",
  );
});
test("halts deny only the affected listing and end at their exclusive boundary", async () => {
  await getPool().execute(
    "INSERT INTO listing_halts (id,listing_id,starts_at,ends_at,reason,evidence_ref) VALUES (?,?,?,?,'Disposable training halt','integration-fixture')",
    [
      `${listingId}-halt`,
      listingId,
      new Date("2026-06-23T01:00:00Z"),
      new Date("2026-06-23T01:30:00Z"),
    ],
  );
  assert.equal(
    (await listingPolicy(listingId, new Date("2026-06-23T01:00:00Z")))?.code,
    "HALTED",
  );
  assert.equal(
    (await listingPolicy(listingId, new Date("2026-06-23T01:30:00Z")))
      ?.sessionEligible,
    true,
  );
  assert.equal(
    (await listingPolicy("sim-xtks-hikari", new Date("2026-06-23T01:00:00Z")))
      ?.sessionEligible,
    true,
  );
});
test("out-of-band overlapping records are denied rather than selecting an arbitrary version", async () => {
  const [rows] = await getPool().execute<RowDataPacket[]>(
    "SELECT id FROM listing_policy_versions WHERE listing_id=? ORDER BY effective_from LIMIT 1",
    [listingId],
  );
  const duplicate = "f".repeat(64);
  await getPool().execute(
    "INSERT INTO listing_policy_versions (id,listing_id,calendar_id,rule_id,data_mode,effective_from,effective_to) SELECT ?,listing_id,calendar_id,rule_id,data_mode,DATE_ADD(effective_from,INTERVAL 1 MINUTE),effective_to FROM listing_policy_versions WHERE id=?",
    [duplicate, rows[0].id],
  );
  try {
    assert.equal(
      (await listingPolicy(listingId, new Date("2026-06-23T01:30:00Z")))?.code,
      "POLICY_CONFLICT",
    );
  } finally {
    await getPool().execute(
      "DELETE FROM listing_policy_versions WHERE id=? AND listing_id=?",
      [duplicate, listingId],
    );
  }
});
test("real mode cannot reuse fictional provenance or bypass unknown permissions and venue rights", async () => {
  const real = {
    ...fixture,
    calendar: {
      ...fixture.calendar,
      id: `${listingId}-real-calendar`,
      dataMode: "real" as const,
    },
    rules: {
      ...fixture.rules,
      id: `${listingId}-real-rules`,
      dataMode: "real" as const,
    },
  };
  await assert.rejects(publishListingPolicy(real), /UNREVIEWED_POLICY/);
  await getPool().execute("UPDATE securities SET fictional=false WHERE id=?", [
    securityId,
  ]);
  try {
    const approved = {
      ...real,
      calendar: { ...real.calendar, evidenceKind: "reviewed" as const },
      rules: { ...real.rules, evidenceKind: "reviewed" as const },
      permissions: {
        ...real.permissions,
        status: "unknown" as const,
        displayAllowed: false,
        simulationAllowed: false,
        verifiedAt: null,
      },
    };
    const id = await publishListingPolicy(approved);
    const unapproved = await listingPolicy(
      listingId,
      new Date("2026-06-23T01:30:00Z"),
    );
    assert.equal(unapproved?.code, "PERMISSION_REQUIRED");
    assert.equal(unapproved?.policy, null);
    // Simulate a trusted permission approval only for this disposable fixture; venue rights remain unknown.
    await getPool().execute(
      "UPDATE listing_policy_permissions SET status='verified',display_allowed=true,simulation_allowed=true,verified_at=? WHERE policy_id=?",
      [new Date("2026-01-01T00:00:00Z"), id],
    );
    assert.equal(
      (await listingPolicy(listingId, new Date("2026-06-23T01:30:00Z")))?.code,
      "REAL_DATA_DISABLED",
    );
  } finally {
    await getPool().execute("UPDATE securities SET fictional=true WHERE id=?", [
      securityId,
    ]);
  }
});
test("corrupt policy content fails closed without choosing an unchecked calendar", async () => {
  const pool = getPool();
  await pool.execute(
    "UPDATE market_calendar_versions SET definition=JSON_SET(definition,'$.timezone','UTC') WHERE id=?",
    [fixture.calendar.id],
  );
  try {
    assert.equal(
      (await listingPolicy(listingId, new Date("2026-06-23T01:30:00Z")))?.code,
      "INVALID_POLICY",
    );
  } finally {
    await pool.execute(
      "UPDATE market_calendar_versions SET definition=? WHERE id=?",
      [JSON.stringify(fixture.calendar), fixture.calendar.id],
    );
  }
});
test("public policy reads use the server clock, expose fixture provenance and cannot mutate rules", async () => {
  for (const row of scenarios) {
    const response = await fetch(`${base}/api/listings/${row.id}/policy`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const view = await response.json();
    assert.equal(view.listingId, row.id);
    assert.equal(view.executionAvailable, false);
    assert.equal(view.realDataEnabled, false);
    assert.equal(view.policy.calendar.evidenceKind, "fictional");
    assert.equal(view.policy.calendar.timezone, row.timezone);
  }
  assert.equal(
    (await fetch(`${base}/api/listings/sim-xtks-hikari/policy?at=2030-01-01`))
      .status,
    400,
  );
  assert.equal(
    (await fetch(`${base}/api/listings/missing-listing/policy`)).status,
    404,
  );
  assert.equal(
    (
      await fetch(`${base}/api/listings/sim-xtks-hikari/policy`, {
        method: "POST",
      })
    ).status,
    405,
  );
});
test("repeating fixture seeds preserves policy identities and never verifies real simulation", async () => {
  const [before] = await getPool().query<RowDataPacket[]>(
    "SELECT id FROM listing_policy_versions WHERE listing_id LIKE 'sim-%' ORDER BY id",
  );
  await seedMarketPolicies();
  const [after] = await getPool().query<RowDataPacket[]>(
    "SELECT id FROM listing_policy_versions WHERE listing_id LIKE 'sim-%' ORDER BY id",
  );
  assert.deepEqual(after, before);
  const [real] = await getPool().query<RowDataPacket[]>(
    "SELECT status FROM venue_capabilities WHERE capability='real_simulation'",
  );
  assert.ok(real.every((row) => row.status === "unknown"));
});
