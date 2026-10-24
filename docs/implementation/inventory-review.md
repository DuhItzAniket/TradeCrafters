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

The catalog operator needs its existing catalog read/publication grants plus permission for the serialization reads. In MySQL 8.4, `SELECT ... FOR UPDATE` requires an additional applicable locking privilege beyond `SELECT`; see [MySQL locking reads](https://dev.mysql.com/doc/refman/8.4/en/innodb-locking-reads.html). This workflow was verified with `UPDATE` limited to three catalog key columns. A database administrator can apply the following to the **existing catalog operator**, replacing the example schema/account names:

```sql
GRANT UPDATE (id) ON `your_database`.`catalog_import_guard` TO 'catalog_operator'@'%';
GRANT UPDATE (snapshot_id) ON `your_database`.`catalog_snapshots` TO 'catalog_operator'@'%';
GRANT UPDATE (mic) ON `your_database`.`mic_record_versions` TO 'catalog_operator'@'%';
```

These are operator permissions for locking reads; the publisher does not update those keys. Its normal writes remain audited classification publication. Preserve the web identity's exact grant contract and do not add these grants to it. A privilege rejection must be diagnosed against the documented statement/table; do not replace it with a wildcard or full-schema write grant.

Publication requires a current review and explicit operator URL. Before the first classification, the existing immutable snapshot importer verifies the persisted source definitions, projection, hash and metadata; on an empty initialized application database it registers that source with its normal audit. A conflicting retained snapshot rejects the operation. All fifteen classification inputs are schema-validated before publication. The operation uses one existing transaction per MIC, with before/after catalog audits. It reports how many rows completed if interrupted. An identical retry is idempotent and retains completed work; it is not a single all-or-nothing batch. A newer review already stored for a row rejects an older one rather than overwriting it.

After publication, inspect `GET /api/catalog/coverage` and each directory classification filter. Expect the counts above while reviews remain current, all 2,889 reference rows still accounted for, `universeReviewComplete=false`, `realSimulationEnabled=0`, and zero enabled venues for all nine capability types. Confirm a second identical publish adds no classification audit events. A change to classification never supplies price, rule or public-simulator permission.

To correct a finding, retain this dated manifest and publish a later review with its own evidence and expiry. Do not alter the registered source or an applied migration. The current classification table retains the latest assessment; catalog audit retains prior before/after values. Changing a row to unknown requires a new explicit review, or occurs naturally when its review expires.

## Hosted verification — 24 October 2026

[PR #40](https://github.com/DuhItzAniket/TradeCrafters/pull/40) merged after [required CI](https://github.com/DuhItzAniket/TradeCrafters/actions/runs/40063865432) passed **201 checks** (86 unit/configuration, 19 provider HTTP/MySQL, 96 application HTTP/MySQL), artifact verification, clean installation, audit, production build, encrypted recovery and standalone container checks.

The first hosted attempt stopped at 0/15 classifications because the existing operator could read the catalog but lacked the locking-read grants above. The three column grants corrected that configuration gap; no identities or table schemas changed. The web identity's full grant list was compared before/after and remained identical. Its independent runtime preflight then passed exact grants, actual privilege denials, verified TLS, required reads, expiry scheduler and the existing 12-connection user cap with two connections per process (server limit 76, reserve 16).

At **04:58:36 UTC**, all fifteen hosted reviews were published. An identical retry kept classification audit count **15 → 15**. At **04:59:50 UTC**, the public coverage endpoint and all three classification filters returned **11 / 2 / 2,876**, summing to **2,889**, with exact reviewed MIC membership in the two classified filters. The effective snapshot remained null before 26 October; all real simulation/capability enablement remained zero. These checks used public metadata and did not require an owner session.

Production deployment `dpl_D5MvDLEgJtkQXrB1nGK6JqApYyjf` was verified READY on exact merged main `324923c9d5e22291463f3145c26e6b3c68cd28d3`, with the canonical demo alias assigned in Mumbai. All six public synthetic smoke probes passed at **05:00:27 UTC**. This records public liveness, rendered policy, reference/chart reads and anonymous portfolio denial; it does not claim a new authenticated trading walkthrough or real provider acceptance. M3 feedback, M5 real-data acceptance and the complete worldwide inventory remain open.

## Remaining work

- Acquire and review an actual prior effective MIC source; the latest mutable download and October annex are insufficient to reconstruct the whole prior register safely.
- Continue classification across all remaining countries/segments and investigate missing/non-MIC identities. This first batch establishes neither a complete denominator nor a country priority order.
- Compare real listing/provider mappings, separate history/EOD/delayed/live/actions/FX capabilities and obtain account-specific public display, simulation, retention and replay terms.
- Review local sessions, holidays, ticks/lots/bands, halts and corporate actions before execution. Public source pages and reviewed venue presence do not enable a trading path.

See [catalog publication contracts](catalog-operations.md), [provider research coordination](provider-coordination.md) and [the global roadmap](../ROADMAP.md). M3 student feedback remains independent of these source reviews.
