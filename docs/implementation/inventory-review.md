# Worldwide inventory evidence workflow

The first dated review batch is [24 October 2026](../research/evidence/inventory-2026-10-24.md), with a [complete 2,889-row CSV](../research/evidence/inventory-2026-10-24.csv) and a machine-readable manifest at `packages/market-catalog/data/inventory-review-2026-10-24.json`. It is a partial public-source investigation for [#9](https://github.com/DuhItzAniket/TradeCrafters/issues/9); M5 data rights and execution remain separate.

## What the numbers mean

The batch assesses fifteen MIC records across Africa, the Americas, Asia, Europe, the Middle East and Oceania. Eleven have evidence of cash-equity presence, two identify other facilities, and two remain deliberately unknown. The complete reference assessment is therefore **11 cash-equity, 2 other facilities and 2,876 unknown**. Of those unknown records, 2,874 have not been reviewed and two have an unresolved review. These are MIC record counts, not a claim that the world has 2,889 stock exchanges or that eleven real exchanges are integrated.

Operating records can cover multiple products. `operating_contains_cash_equity` means evidence supports cash equities somewhere within that operating identity; it does not classify every child or every instrument. `XTKS` is a Tokyo cash-equity segment under `XJPX`; the parent remains unknown pending the counting/scope decision. `XASX` has cash-equity presence while its `XSFE` Trade24 segment is separately classified as derivatives. The report also deduplicates reviewed cash-equity records by operating MIC rather than adding parent and child counts.

Every source row, including 574 expired entries, remains available. A future or expired review resolves to unknown without dropping its source row. A non-unknown assessment cannot be attached to an expired source record. The October publication's implementation date is **26 October**; this review does not invent the actual prior effective baseline or apply future market changes early. The official [ISO publication calendar](https://www.iso20022.org/market-identifier-codes) remains authoritative.

Bhutan and Ethiopia have supplemental identity entries with official source links and explicit next actions. This snapshot has no `BT` or `ET` country records and no Bhutan/Ethiopia name match was found. That observation does not prove the exchanges have no MIC anywhere: alternate/historical identifiers and registration-authority mapping still need investigation. Supplemental candidates are kept outside the MIC counts. No artificial MIC, listing, price or trading entitlement is created. Ethiopia's direct pages timed out and its evidence is indexed primary text; direct source verification remains open. JSE also stays unknown after a direct 403 despite supportive indexed official text.

## Reproduce and validate

Use Node 24.22.0 and the installed workspace dependencies:

```sh
npm run inventory -- report
npm run inventory -- check
```

`report` regenerates the Markdown assessment and complete CSV. `check` fails if either differs from the validated manifest/source; CI runs it. Both operate offline without database access, accounts or provider keys. The artifact is deliberately pinned to its historical review timestamp so it remains reproducible after expiry. It is not a live coverage dashboard.

The manifest binds the exact source publication, implementation date, row count, canonical normalized content hash and individual MIC identity hashes. It includes dated review/expiry, primary URLs, source-access quality, scope, reasoning and follow-up work. These hashes detect mismatch; they are not vendor signatures or independent human attestations. The reviewer label explicitly identifies agent research. Public-source retrieval does not grant a right to redistribute market prices; the manifest and generated artifacts contain metadata and concise findings, not copied quote histories.

Tests reject source drift, duplicate or guessed identities, operating/segment scope mismatch, indexed-only promotion, extra permission fields, supplemental reconciliation errors and invalid clocks. Future/expired reviews revert to unknown; group counting cannot inflate when a parent and child are both assessed. CSV cells quote delimiters/newlines and prefix formula-leading text for spreadsheet safety. The original definitions remain in the reference JSON.

## Explicit classification publication

A fresh database still starts with unknown classifications. The review is published separately through the existing audited classification service. It does not add an application migration, grant, capability record or provider integration.

Prepare an ignored operator env file containing **`OPERATOR_DATABASE_URL`** and the existing MySQL TLS settings, using the already provisioned catalog operator identity. Do not give the web process this identity. Then run:

```sh
node --env-file=.local/inventory-operator.env --import tsx scripts/inventory.ts publish
```

Publication requires a current review and explicit operator URL. Before the first classification, the existing immutable snapshot importer verifies the persisted source definitions, projection, hash and metadata; on an empty initialized application database it registers that source with its normal audit. A conflicting retained snapshot rejects the operation. All fifteen classification inputs are schema-validated before publication. The operation uses one existing transaction per MIC, with before/after catalog audits. It reports how many rows completed if interrupted. An identical retry is idempotent and retains completed work; it is not a single all-or-nothing batch. A newer review already stored for a row rejects an older one rather than overwriting it.

After publication, inspect `GET /api/catalog/coverage` and each directory classification filter. Expect the counts above while reviews remain current, all 2,889 reference rows still accounted for, `universeReviewComplete=false`, `realSimulationEnabled=0`, and zero enabled venues for all nine capability types. Confirm a second identical publish adds no classification audit events. A change to classification never supplies price, rule or public-simulator permission.

To correct a finding, retain this dated manifest and publish a later review with its own evidence and expiry. Do not alter the registered source or an applied migration. The current classification table retains the latest assessment; catalog audit retains prior before/after values. Changing a row to unknown requires a new explicit review, or occurs naturally when its review expires.

## Remaining work

- Acquire and review an actual prior effective MIC source; the latest mutable download and October annex are insufficient to reconstruct the whole prior register safely.
- Continue classification across all remaining countries/segments and investigate missing/non-MIC identities. This first batch establishes neither a complete denominator nor a country priority order.
- Compare real listing/provider mappings, separate history/EOD/delayed/live/actions/FX capabilities and obtain account-specific public display, simulation, retention and replay terms.
- Review local sessions, holidays, ticks/lots/bands, halts and corporate actions before execution. Public source pages and reviewed venue presence do not enable a trading path.

See [catalog publication contracts](catalog-operations.md), [provider research coordination](provider-coordination.md) and [the global roadmap](../ROADMAP.md). M3 student feedback remains independent of these source reviews.
