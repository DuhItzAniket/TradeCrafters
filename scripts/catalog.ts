import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { ZodError } from "zod";
import {
  aliasAssignmentSchema,
  snapshotSchema,
  classificationSchema,
  capabilitySchema,
} from "@tradecrafters/domain/catalog";
import { assignProviderAlias } from "@tradecrafters/database/aliases";
import {
  registerCatalogSnapshot,
  reviewVenueClassification,
  publishMarketCapability,
  catalogCoverage,
} from "@tradecrafters/database/catalog";
import { closePool } from "@tradecrafters/database";
if (process.env.OPERATOR_DATABASE_URL)
  process.env.DATABASE_URL = process.env.OPERATOR_DATABASE_URL;
try {
  const [command, file, ...extra] = process.argv.slice(2);
  if (extra.length || (command === "status" ? !!file : !file))
    throw Error("USAGE");
  if (command === "status")
    console.log(JSON.stringify(await catalogCoverage(), null, 2));
  else {
    const path = resolve(file);
    if (statSync(path).size > 8 * 1024 * 1024) throw Error("INPUT_TOO_LARGE");
    const input: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (command === "alias")
      await assignProviderAlias(aliasAssignmentSchema.parse(input));
    else if (command === "snapshot") {
      const value = snapshotSchema.parse(input);
      if (value.sourceKind !== "iso10383") throw Error("INVALID_SOURCE");
      await registerCatalogSnapshot(value);
    } else if (command === "classify")
      await reviewVenueClassification(classificationSchema.parse(input));
    else if (command === "capability")
      await publishMarketCapability(capabilitySchema.parse(input));
    else throw Error("USAGE");
    console.log(
      "Catalog operation completed; publication audit retained. Input values are not printed.",
    );
  }
} catch (error) {
  const codes = new Set([
    "USAGE",
    "INPUT_TOO_LARGE",
    "INVALID_SOURCE",
    "LISTING_NOT_FOUND",
    "OVERLAPPING_PROVIDER_ALIAS",
    "IMMUTABLE_CATALOG_SNAPSHOT",
    "CATALOG_INTEGRITY_FAILURE",
    "INVALID_CATALOG_BASELINE",
    "VENUE_NOT_FOUND",
    "INVALID_CLASSIFICATION_PERIOD",
    "STALE_CLASSIFICATION_REVIEW",
    "INVALID_CAPABILITY_PERIOD",
    "CAPABILITY_LISTING_MISMATCH",
    "OVERLAPPING_MARKET_CAPABILITY",
  ]);
  console.error(
    error instanceof ZodError
      ? "Catalog input does not match the documented schema."
      : error instanceof Error && codes.has(error.message)
        ? `Catalog operation rejected: ${error.message}.`
        : "Catalog operation failed. Check configuration and the private input file.",
  );
  process.exitCode = 1;
} finally {
  await closePool();
}
