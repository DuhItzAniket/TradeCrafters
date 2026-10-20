import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { getPool, closePool } from "@tradecrafters/database";
import {
  assignProviderAlias,
  resolveProviderAlias,
  seedProviderAliases,
} from "@tradecrafters/database/aliases";
import { scenarios } from "@tradecrafters/market-catalog/scenarios";
const scope = `alias-it-${randomUUID()}`;
const provider = scope;
const listings = [scope + "-a", scope + "-b", scope + "-c"];
const base = process.env.BETTER_AUTH_URL || "http://127.0.0.1:3000";
const assignment = {
  listingId: listings[0],
  provider,
  alias: "ATLS",
  effectiveFrom: "2010-01-01",
  effectiveTo: "2020-01-01",
  actor: scope,
  reason: "Disposable integration mapping evidence",
};
before(async () => {
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
  assert.ok(
    ["localhost", "127.0.0.1", "mysql"].includes(
      new URL(process.env.DATABASE_URL!).hostname,
    ),
  );
  for (const [index, listing] of listings.entries()) {
    await getPool().execute(
      "INSERT INTO securities (id,name,fictional) VALUES (?,'Disposable alias security',true)",
      [listing],
    );
    await getPool().execute(
      "INSERT INTO listings (id,security_id,mic,symbol,settlement_currency,quote_unit,unit_numerator,unit_denominator,timezone,fixture_policy) VALUES (?,?,?,?,'USD','USD',1,1,'UTC',JSON_OBJECT())",
      [listing, listing, ["XLON", "XASX", "XNAS"][index], scope.slice(-8)],
    );
  }
});
after(async () => {
  try {
    await getPool().execute("DELETE FROM catalog_audit WHERE actor=?", [scope]);
    for (const listing of listings) {
      await getPool().execute(
        "DELETE FROM provider_aliases WHERE listing_id=?",
        [listing],
      );
      await getPool().execute("DELETE FROM listings WHERE id=?", [listing]);
      await getPool().execute("DELETE FROM securities WHERE id=?", [listing]);
    }
    for (const name of [provider, provider + "-race", provider + "-other"])
      await getPool().execute(
        "DELETE FROM provider_alias_namespaces WHERE provider=?",
        [name],
      );
  } finally {
    await closePool();
  }
});
test("alias publication serializes duplicates and rejects alias/listing overlap atomically", async () => {
  const ids = await Promise.all(
    Array.from({ length: 8 }, () => assignProviderAlias(assignment)),
  );
  assert.equal(new Set(ids).size, 1);
  const [audit] = await getPool().execute<RowDataPacket[]>(
    "SELECT COUNT(*) AS count FROM catalog_audit WHERE actor=?",
    [scope],
  );
  assert.equal(Number(audit[0].count), 1);
  await assert.rejects(
    assignProviderAlias({ ...assignment, listingId: listings[1] }),
    /OVERLAPPING_PROVIDER_ALIAS/,
  );
  await assert.rejects(
    assignProviderAlias({ ...assignment, alias: "OTHER" }),
    /OVERLAPPING_PROVIDER_ALIAS/,
  );
  await assert.rejects(
    assignProviderAlias({ ...assignment, listingId: "nonexistent-listing" }),
    /LISTING_NOT_FOUND/,
  );
});
test("renamed and reused symbols resolve to the correct listing on the exact dated boundary", async () => {
  await assignProviderAlias({
    ...assignment,
    alias: "NEW",
    effectiveFrom: "2020-01-01",
    effectiveTo: null,
  });
  await assignProviderAlias({
    ...assignment,
    listingId: listings[1],
    effectiveFrom: "2020-01-01",
    effectiveTo: null,
  });
  assert.equal(
    (
      await resolveProviderAlias(
        provider,
        "ATLS",
        new Date("2019-12-31T23:59:59Z"),
      )
    ).listing?.id,
    listings[0],
  );
  assert.equal(
    (
      await resolveProviderAlias(
        provider,
        "ATLS",
        new Date("2020-01-01T00:00:00Z"),
      )
    ).listing?.id,
    listings[1],
  );
  assert.equal(
    (
      await resolveProviderAlias(
        provider,
        "NEW",
        new Date("2020-01-01T00:00:00Z"),
      )
    ).listing?.id,
    listings[0],
  );
  assert.equal(
    (
      await resolveProviderAlias(
        provider,
        "ATLS",
        new Date("2009-12-31T23:59:59Z"),
      )
    ).status,
    "missing",
  );
});
test("case-sensitive aliases and distinct provider namespaces cannot silently collapse", async () => {
  await assignProviderAlias({
    ...assignment,
    alias: "Case",
    listingId: listings[1],
    effectiveFrom: "2000-01-01",
    effectiveTo: "2010-01-01",
  });
  await assignProviderAlias({
    ...assignment,
    alias: "CASE",
    listingId: listings[2],
    effectiveFrom: "2000-01-01",
    effectiveTo: "2010-01-01",
  });
  await assignProviderAlias({
    ...assignment,
    provider: provider + "-other",
    listingId: listings[2],
  });
  assert.equal(
    (await resolveProviderAlias(provider, "Case", new Date("2005-01-01Z")))
      .listing?.id,
    listings[1],
  );
  assert.equal(
    (await resolveProviderAlias(provider, "CASE", new Date("2005-01-01Z")))
      .listing?.id,
    listings[2],
  );
  assert.equal(
    (
      await resolveProviderAlias(
        provider + "-other",
        "ATLS",
        new Date("2015-01-01Z"),
      )
    ).listing?.id,
    listings[2],
  );
});
test("concurrent claims by different listings produce one owner of a provider alias", async () => {
  const outcomes = await Promise.allSettled(
    listings.slice(0, 2).map((listingId) =>
      assignProviderAlias({
        ...assignment,
        listingId,
        provider: provider + "-race",
        alias: "RACE",
        effectiveFrom: "2025-01-01",
        effectiveTo: null,
      }),
    ),
  );
  assert.equal(
    outcomes.filter((value) => value.status === "fulfilled").length,
    1,
  );
  assert.equal(
    outcomes.filter((value) => value.status === "rejected").length,
    1,
  );
  assert.equal(
    (
      await resolveProviderAlias(
        provider + "-race",
        "RACE",
        new Date("2026-01-01Z"),
      )
    ).status,
    "resolved",
  );
});
test("out-of-band alias and canonical-listing conflicts fail closed", async () => {
  for (const alias of ["ATLS", "CORRUPT"]) {
    const listing = alias === "ATLS" ? listings[2] : listings[0];
    await getPool().execute(
      "INSERT INTO provider_aliases (listing_id,provider,alias,effective_from,effective_to) VALUES (?,?,?,'2015-01-01','2019-01-01')",
      [listing, provider, alias],
    );
    try {
      assert.equal(
        (await resolveProviderAlias(provider, "ATLS", new Date("2016-01-01Z")))
          .status,
        "conflict",
      );
    } finally {
      await getPool().execute(
        "DELETE FROM provider_aliases WHERE provider=? AND alias=? AND effective_from='2015-01-01'",
        [provider, alias],
      );
    }
  }
});
test("public lookup disambiguates fictional global aliases without accepting a client clock", async () => {
  for (const row of scenarios) {
    const response = await fetch(
      `${base}/api/catalog/aliases?provider=synthetic-v1&alias=${encodeURIComponent(`${row.symbol}.${row.mic}`)}`,
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal((await response.json()).listing.id, row.id);
  }
  const endpoint = `${base}/api/catalog/aliases?provider=synthetic-v1&alias=ATLS.XLON`;
  assert.equal((await fetch(endpoint + "&at=2020-01-01")).status, 400);
  assert.equal((await fetch(endpoint + "&alias=ATLS.XASX")).status, 400);
  assert.equal(
    (await fetch(endpoint.replace("ATLS.XLON", "ATLS"))).status,
    404,
  );
  assert.equal((await fetch(endpoint, { method: "POST" })).status, 405);
});
test("fictional alias seed is repeatable without extra mappings or audit records", async () => {
  const [before] = await getPool().query<RowDataPacket[]>(
    "SELECT id FROM provider_aliases WHERE provider='synthetic-v1' ORDER BY id",
  );
  await seedProviderAliases();
  const [after] = await getPool().query<RowDataPacket[]>(
    "SELECT id FROM provider_aliases WHERE provider='synthetic-v1' ORDER BY id",
  );
  assert.equal(after.length, 10);
  assert.deepEqual(after, before);
});
