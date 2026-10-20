# Catalog identity, inventory and operator workflow

The M1 catalog stores worldwide reference identity, provider aliases and evidence contracts. It keeps unknown coverage visible. It does not enable a real price feed or order execution.

## Provider aliases

`assignProviderAlias` publishes one canonical alias per listing/provider at a given UTC date. Provider names are lowercase namespaces; aliases are case-sensitive and retain provider punctuation. A provider suffix is not interpreted as a MIC. A security may have several listings, each with independent aliases.

The transaction locks the existing listing and a persistent provider/alias namespace row before checking overlap. This serializes first publication, concurrent duplicate requests and competing claims by different listings. Inclusive starts and exclusive ends allow a symbol to be renamed or reused on an exact date boundary without rewriting history. An identical retry returns the existing ID without another audit event. Overlap on either the alias or canonical listing mapping is rejected.

`GET /api/catalog/aliases?provider=synthetic-v1&alias=ATLS.XLON` resolves using the current server UTC date. Missing mappings return 404; inconsistent overlapping stored records return 409 with no listing. Repeated parameters, additional fields and date overrides are rejected. There is no public write endpoint. The ten seeded `synthetic-v1` mappings are project-owned fictional fixtures; they establish no vendor coverage.

## Reference versions and classification

Migration 0007 registers a snapshot's publication date, effective date, source, retrieval date, parent, record count and canonical content hash. Each MIC retains its complete normalized definition and hash, including operating/segment relationship and source dates. The directory projection is checked against those definitions during publication/repeat imports. Changed content, effective date, source or parent under an existing publication ID is rejected. Retrieval date records the initial import; a repeat does not replace it. Imports have a dedicated database lock and commit the snapshot, records, diff and audit together.

Active segment references must point to an operating record. The October source also retains eight expired segments whose referenced former operating record is now a segment. Those historical source relationships are preserved rather than silently removed or rewritten; they do not establish current eligibility. Missing parent codes and self-referencing segments are rejected.

A child snapshot records explicit added, removed and changed MICs while preserving its parent. The first registered baseline has no invented predecessor and no “all venues newly added” diff. `effectiveCatalogSnapshot` never promotes a publication before its effective date. With only the 12 October reference registered, there is no effective baseline before 26 October; the product exposes that gap instead of manufacturing a prior state. This follows the [ISO registration authority's publication/implementation distinction](https://www.iso20022.org/market-identifier-codes).

Classification reviews attach to a particular snapshot/MIC. They record public evidence, reviewer label, reason, review time and expiry, with a maximum 366-day review period. Expired or future reviews resolve to unknown. Stale review writes are rejected; changes retain before/after audit records. The current review table is a current assessment, with historical changes in the audit; it is not an execution-ready historical classification replay service.

`GET /api/catalog/coverage` and the directory account for every reference row as reviewed cash equity, another facility or unknown. The directory can filter those categories without removing unreviewed records from the underlying inventory. **The current 2,889 rows are all awaiting classification review.** A complete reviewed worldwide cash-equity denominator and missing non-MIC venue investigation remain in #9/M5/M7. Directory presence, source status and a familiar exchange name do not prove data rights or simulation readiness.

## Provider capability contracts

Capability versions distinguish listings, historical, EOD, delayed, live, display, retention, replay and simulation. A record includes snapshot/MIC, provider, dataset, venue or explicit listing scope, feed/delay, asset class, audience, independent allowed uses, retention period, evidence reference, check/effective/expiry timestamps and blocking reason. Unsupported or unknown permissions default to disabled. Live and delayed freshness declarations cannot be interchanged. Selected real-listing scope must match the stated venue and cannot refer to a fictional listing.

Publication is audited and rejects overlapping effective versions for the same snapshot, venue, provider, dataset and capability. Identical concurrent publication is idempotent. The pure permission checker rejects private-audience, future, blocked, unknown or expired use. These are evidence contracts: no single record turns on execution. Coverage responses continue to report zero enabled real venues. M5 must combine reviewed venue/listing/rule/quote evidence, approvals, revocation and provider quality/quota checks before any real-data path is enabled. Keep private contracts outside Git; use a sanitized evidence identifier.

## Trusted operator CLI

Use Node 24 from the repository root with the separately authorized operator database identity. `OPERATOR_DATABASE_URL`, if set, is consumed only by the operator CLIs. The web identity has catalog reads and cannot publish these records.

```sh
npm run catalog -- status
npm run catalog -- alias path/to/private-alias.json
npm run catalog -- snapshot path/to/reviewed-snapshot.json
npm run catalog -- classify path/to/classification-review.json
npm run catalog -- capability path/to/private-capability-summary.json
```

Files must match the strict schemas in `packages/domain/src/catalog.ts` and stay below 8 MiB. They include an operator `actor` label and a reason (`blockingReason` for capability records). The CLI's actor label documents the trusted operator's declaration; it is not independent identity attestation. Hosted operator attribution and external audit retention remain operational work.

For example, this alias file exercises the already-seeded fictional mapping and is safe to retry:

```json
{
  "listingId": "sim-xlon-atlas",
  "provider": "synthetic-v1",
  "alias": "ATLS.XLON",
  "effectiveFrom": "2026-01-01",
  "effectiveTo": null,
  "actor": "operator-cli",
  "reason": "Confirm the existing project-owned fictional alias"
}
```

Snapshot inputs contain `publishedOn`, `changesEffectiveOn`, `retrievedOn`, `sourceKind: "iso10383"`, `sourceUrl`, `parentSnapshot`, normalized `records`, `actor` and `reason`. Tests use an isolated source kind that is excluded from public inventory selection. Do not hand-edit an applied SQL migration or rewrite a registered definition to extend coverage; publish the next version and retain a valid baseline.

## FX foundation contract

`packages/domain/src/fx.ts` defines a server-owned, account-bound synthetic quote and a request containing only `quoteId` and positive native `sourceMinor`. A quote names its currencies, exact rational rate, provider/evidence, observation/effective/expiry timestamps and rounding policy. Validity is bounded to five minutes. Currency exponents are applied independently and integer floor rounding returns the exact remainder. Wrong account/quote, future/expired values, invalid amounts, dust and overflow are rejected.

This calculation does not debit a wallet, post a journal or expose a conversion API. Opening-grant constants are separate from executable FX quotes. M2 must add quote issuance, session ownership, wallet locks, idempotency and linked balanced native-currency journals before conversion is available.

See [M1 acceptance](m1-acceptance.md), [market policies](market-policies.md), [local setup](local-development.md) and [administrator operations](admin-security.md).
