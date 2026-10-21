import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseMinor,
  formatMinor,
  quoteToMinor,
  openingGrant,
  isContinuousSession,
  type SessionPolicy,
} from "@tradecrafters/domain";
import {
  createAccountSchema,
  createWalletSchema,
  directoryQuery,
  simulationControlSchema,
} from "@tradecrafters/contracts";
import { micDirectory, directorySource } from "@tradecrafters/market-catalog";
import { scenarios } from "@tradecrafters/market-catalog/scenarios";

test("money is exact beyond Number precision and respects variable currency exponents", () => {
  assert.equal(parseMinor("9007199254740993.05", 2), 900719925474099305n);
  assert.equal(parseMinor("8420", 0), 8420n);
  assert.equal(parseMinor("0.746", 3), 746n);
  assert.equal(
    formatMinor("900719925474099305", 2),
    "9,007,199,254,740,993.05",
  );
  for (const bad of ["-1", "1e8", "NaN", "1,000", " 1", "1.0000001"])
    assert.throws(() => parseMinor(bad, 2));
  assert.throws(() => parseMinor("0.1", 0));
  assert.throws(() => parseMinor("1.005", 2));
});
test("pence quotes become pounds without a 100x error or silent rounding", () => {
  assert.equal(quoteToMinor("1248.00", 2, 1n, 100n, 2), 1248n);
  assert.equal(quoteToMinor("0.746", 3, 1n, 1n, 3), 746n);
  assert.throws(() => quoteToMinor("1248.01", 2, 1n, 100n, 2));
  assert.throws(() => quoteToMinor("1", 0, 1n, 0n, 2));
});
test("each opening grant starts from one fixed synthetic USD budget", () => {
  assert.equal(openingGrant("USD").minor, "10000000");
  assert.equal(openingGrant("JPY").minor, "15000000");
  assert.equal(openingGrant("KWD").minor, "30000000");
  assert.equal(openingGrant("INR").baseMinor, "10000000");
});
test("timezone-aware fixture policy handles breaks, boundaries, holidays and local date", () => {
  const tokyo: SessionPolicy = {
    timezone: "Asia/Tokyo",
    weekdays: [1, 2, 3, 4, 5],
    intervals: [
      ["09:00", "11:30"],
      ["12:30", "15:30"],
    ],
    closedDates: ["2026-10-21"],
  };
  assert.equal(
    isContinuousSession(new Date("2026-10-20T00:00:00Z"), tokyo),
    true,
  );
  assert.equal(
    isContinuousSession(new Date("2026-10-20T02:30:00Z"), tokyo),
    false,
  );
  assert.equal(
    isContinuousSession(new Date("2026-10-20T03:30:00Z"), tokyo),
    true,
  );
  assert.equal(
    isContinuousSession(new Date("2026-10-21T01:00:00Z"), tokyo),
    false,
  );
  assert.equal(
    isContinuousSession(new Date("2026-10-24T01:00:00Z"), tokyo),
    false,
  );
});
test("fixture session policy handles DST and a Sunday trading week", () => {
  const london: SessionPolicy = {
    timezone: "Europe/London",
    weekdays: [1, 2, 3, 4, 5],
    intervals: [["08:00", "16:30"]],
    closedDates: [],
  };
  assert.equal(
    isContinuousSession(new Date("2026-10-23T07:15:00Z"), london),
    true,
  );
  assert.equal(
    isContinuousSession(new Date("2026-10-26T07:15:00Z"), london),
    false,
  );
  const riyadh: SessionPolicy = {
    timezone: "Asia/Riyadh",
    weekdays: [0, 1, 2, 3, 4],
    intervals: [["10:00", "15:00"]],
    closedDates: [],
  };
  assert.equal(
    isContinuousSession(new Date("2026-10-25T08:00:00Z"), riyadh),
    true,
  );
});
test("strict request contracts reject forged ownership and unsupported fields", () => {
  assert.equal(
    createAccountSchema.safeParse({ reportingCurrency: "JPY" }).success,
    true,
  );
  assert.equal(
    createAccountSchema.safeParse({
      reportingCurrency: "JPY",
      username: "someone",
    }).success,
    false,
  );
  assert.equal(
    createWalletSchema.safeParse({ currency: "USD", amount: 1000 }).success,
    false,
  );
  assert.equal(
    createWalletSchema.safeParse({ currency: "GBX" }).success,
    false,
  );
  assert.equal(directoryQuery.safeParse({ page: -1 }).success, false);
  assert.equal(directoryQuery.safeParse({ q: "x".repeat(81) }).success, false);
});
test("worldwide reference retains operating/segment identities without claiming coverage", () => {
  assert.equal(micDirectory.length, 2889);
  assert.equal(
    new Set(micDirectory.map((row) => row.mic)).size,
    micDirectory.length,
  );
  assert.ok(new Set(micDirectory.map((row) => row.country)).size > 100);
  assert.ok(
    micDirectory.some(
      (row) => row.kind === "SGMT" && row.mic !== row.operatingMic,
    ),
  );
  assert.ok(micDirectory.some((row) => row.status === "EXPIRED"));
  assert.ok(directorySource.changesEffectiveOn > directorySource.retrievedOn);
});
test("same symbol on separate venues keeps separate security/listing identity", () => {
  const atlas = scenarios.filter((row) => row.symbol === "ATLS");
  assert.equal(atlas.length, 2);
  assert.notEqual(atlas[0].id, atlas[1].id);
  assert.notEqual(atlas[0].securityId, atlas[1].securityId);
  assert.notEqual(atlas[0].currency, atlas[1].currency);
  assert.equal(new Set(scenarios.map((row) => row.region)).size, 6);
});

test("admin control contracts distinguish execution from legacy funding and reject unknown scope", () => {
  const command = { paused: true, reason: "Scheduled maintenance window" };
  assert.equal(simulationControlSchema.parse(command).scope, "funding");
  assert.equal(
    simulationControlSchema.parse({ ...command, scope: "execution" }).scope,
    "execution",
  );
  for (const extra of [
    { scope: "all" },
    { paused: "true" },
    { executionPaused: true },
    { reason: "short" },
  ])
    assert.equal(
      simulationControlSchema.safeParse({ ...command, ...extra }).success,
      false,
    );
});
