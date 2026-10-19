# Contributing to TradeCrafters

Start with the [research index](docs/README.md), [roadmap](docs/ROADMAP.md), and [proposed decisions](docs/DECISIONS.md). This is a research-stage modernization of a DBMS project by Aniket Kumar and Annapurna S. Do not assume every legacy README feature is implemented.

Use an issue for a concrete milestone/task, branch from the current main branch, and submit a focused pull request. Include the behavior changed, evidence of verification, and any data/model/migration implications. Do not claim a security finding is fixed without checking its relevant acceptance criteria.

Never commit `.env` values, account exports, database dumps with user data, provider credentials, or raw support agreements. Track database connection **code**, while keeping secrets in environment/secret stores. The legacy `database/` ignore rule must be resolved during implementation so required source is reproducible.

Financial changes need exact-arithmetic, retry and concurrency evidence with real MySQL integration tests. UI changes need desktop/mobile screenshots and loading/error/keyboard checks. New providers need verified permitted use and quota behavior. Update ADRs and documentation with the implementation rather than letting them drift.

The current documentation-only verification command is:

```text
node docs/research/evidence/verify-legacy.cjs
```

It confirms known baseline defects in isolation; it is **not** a passing security or application test suite. The future implementation must add the checks described in the roadmap.
