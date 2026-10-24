import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { directorySource, micDirectory } from "@tradecrafters/market-catalog";
import { micRecordSchema } from "@tradecrafters/domain/catalog";
import {
  inventoryAssessment,
  inventoryClassificationInputs,
  inventorySourceHash,
  validateInventoryReview,
} from "../packages/domain/src/inventory";

const manifest = JSON.parse(
  readFileSync(
    new URL(
      "../packages/market-catalog/data/inventory-review-2026-10-24.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const records = micDirectory.map((row) => micRecordSchema.parse(row));
const asOf = new Date(manifest.reviewedAt);
test("the evidence-bound review accounts for every MIC and separates supplemental mappings from coverage", () => {
  const value = inventoryAssessment(manifest, records, directorySource, asOf);
  assert.equal(value.rows.length, 2889);
  assert.deepEqual(value.counts, {
    cash_equity: 11,
    other_facility: 2,
    unknown: 2876,
  });
  assert.equal(value.reviewedRows, 15);
  assert.equal(value.supplementalCandidates, 2);
  assert.equal(value.universeReviewComplete, false);
  assert.equal(value.realSimulationEnabled, 0);
  assert.equal(value.referenceEffective, false);
  assert.equal(
    value.rows.find((row) => row.mic === "RSEX")?.classification,
    "cash_equity",
  );
  assert.equal(
    value.rows.find((row) => row.mic === "XSPS")?.classification,
    "cash_equity",
  );
  assert.equal(
    value.rows.find((row) => row.mic === "XJPX")?.classification,
    "unknown",
  );
  assert.equal(
    value.rows.find((row) => row.mic === "XSFE")?.classification,
    "other_facility",
  );
  assert.equal(inventoryClassificationInputs(value.review).length, 15);
  assert.equal(
    inventorySourceHash([...records].reverse()),
    inventorySourceHash(records),
  );
});
test("source drift, duplicate reviews, guessed MICs and unsupported scope upgrades cannot be published", () => {
  const edit = (mutate: (value: typeof manifest) => void) => {
    const value = structuredClone(manifest);
    mutate(value);
    assert.throws(() =>
      validateInventoryReview(value, records, directorySource),
    );
  };
  edit((value) => value.reviews.push(value.reviews[0]));
  edit((value) => (value.reviews[0].mic = "XRWA"));
  edit((value) => (value.reviews[0].identityHash = "0".repeat(64)));
  edit(
    (value) =>
      (value.reviews.find((row: { mic: string }) => row.mic === "XTKS").scope =
        "operating_contains_cash_equity"),
  );
  edit(
    (value) =>
      (value.reviews.find(
        (row: { mic: string }) => row.mic === "XJSE",
      ).classification = "cash_equity"),
  );
  edit((value) => {
    const row = value.reviews.find(
      (row: { mic: string }) => row.mic === "XJSE",
    );
    row.scope = "operating_contains_cash_equity";
    row.classification = "cash_equity";
  });
  edit((value) => (value.reviews[0].simulationAllowed = true));
  edit((value) => (value.supplemental[0].referenceCountryRecords = 1));
  edit((value) => (value.supplemental[0].mic = "XBHU"));
  assert.throws(() =>
    validateInventoryReview(
      manifest,
      records.map((row) =>
        row.mic === "XTKS" ? { ...row, country: "US" } : row,
      ),
      directorySource,
    ),
  );
});
test("future or expired reviews become unknown without dropping reference records or inventing an effective baseline", () => {
  for (const date of [
    new Date(asOf.getTime() - 1),
    new Date(manifest.expiresAt),
  ]) {
    const value = inventoryAssessment(manifest, records, directorySource, date);
    assert.deepEqual(value.counts, {
      cash_equity: 0,
      other_facility: 0,
      unknown: 2889,
    });
    assert.equal(value.rows.length, 2889);
    assert.equal(value.realSimulationEnabled, 0);
  }
  assert.equal(
    inventoryAssessment(
      manifest,
      records,
      directorySource,
      new Date("2026-10-26T00:00:00Z"),
    ).referenceEffective,
    true,
  );
  assert.throws(() =>
    inventoryAssessment(
      manifest,
      records,
      directorySource,
      new Date("invalid"),
    ),
  );
});
test("parent and cash segment reviews cannot inflate the operating-group count or classify sibling derivatives", () => {
  const input = structuredClone(manifest);
  const parent = input.reviews.find(
    (row: { mic: string }) => row.mic === "XJPX",
  );
  parent.classification = "cash_equity";
  parent.scope = "operating_contains_cash_equity";
  const value = inventoryAssessment(input, records, directorySource, asOf);
  assert.equal(value.counts.cash_equity, 12);
  assert.equal(value.cashEquityOperatingGroups, 11);
  assert.equal(
    value.rows.find((row) => row.mic === "XSFE")?.classification,
    "other_facility",
  );
  assert.equal(
    value.rows.find((row) => row.mic === "XOSE")?.classification,
    "unknown",
  );
});
