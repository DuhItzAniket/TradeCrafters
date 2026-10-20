# Worldwide MIC reference snapshot

Source: [ISO 10383 Registration Authority, maintained by SWIFT](https://www.iso20022.org/market-identifier-codes). Downloaded 20 October 2026 from the official CSV. Published **12 October 2026**; modification implementation date **26 October 2026**. Attribution remains with the publisher.

`mic-2026-10-12.json` is a normalized subset of the CSV columns (2,889 records), including operating/segment relationship, category, status and source dates. Source status is the **published snapshot status**, not a claim of current effective status. It includes expired codes and non-equity facilities. It is not a verified worldwide cash-equity universe or price-coverage denominator.

The current app presents this as an upcoming reference snapshot. It does not apply future changes to a current trading calendar or enable real execution. Immutable snapshot definitions, parent/diff history, effective-date selection and audited classification/capability workflows are implemented; see [catalog operations](../../../docs/implementation/catalog-operations.md). An actual prior effective source baseline has not been acquired, and all 2,889 records still await classification review. Those gaps remain open before live eligibility can be considered. No rows are silently omitted from search; pagination covers the entire snapshot.

The separately authored scenario fixtures are fictional. Their lot sizes, prices and metadata exercise domain boundaries and are not verified exchange rules. All real-data/display/simulation capabilities default to unknown/disabled.
