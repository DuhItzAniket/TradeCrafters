# Foundation execution status — 20 October 2026

The [M1 foundation acceptance record](m1-acceptance.md) maps the implemented global foundation and verified local identity to the original milestone criteria, with 80 automated checks and browser evidence. Issue [#3](https://github.com/DuhItzAniket/TradeCrafters/issues/3) closes only after required CI and merge. Initial discovery/inventory work also contributes to #5/#9. The worldwide real-market roadmap remains open.

## Implemented

- Additive npm workspaces; Node 24 LTS, Next 16.4.2, React 19.3.1, TypeScript 6.0.3, Better Auth 1.7.11 and MySQL 8.4. Exact package lock, repeatable local setup, tracked SQL source and CI workflow.
- Designed responsive global explorer, selected-listing detail, worldwide venue search/filter/pagination, local sign-in and persisted account/wallet screens. Creator credit remains Aniket Kumar and Annapurna S.
- Official 2,889-record ISO MIC snapshot, with operating/segment identities, expired/non-equity facilities retained and publication/effective dates disclosed. Ten fictional scenarios cover six regions; ATLS disambiguates unrelated securities in London and Australia.
- Database-backed sessions and rate limits, immediate revocation checks (no cookie session cache), exact origin/CSRF checks for mutations, strict bounded account/wallet input, session-derived ownership and sanitized application errors. GitHub OAuth wiring; local-only password mode fails closed in production.
- Owner-assisted local GitHub OAuth callback and reload persistence verified. Authenticator enrollment with locally rendered QR and single-use recovery codes; explicit operator role grants; five-minute session-specific admin verification; audited pause/resume of new simulation funding. See the [operator runbook](admin-security.md) and [security verification](security-verification.md).
- Owner local authenticator enrollment, session verification and explicit operator administrator grant completed. Protected administrator controls loaded successfully in the owner's browser; the grant is recorded in the local audit log.
- Native wallets and exact bigint/minor-unit helpers, zero/two/three currency exponents, GBX/ZAC quote multipliers, one fixed synthetic USD-equivalent opening grant with immutable rate provenance, one grant journal and balanced entries in its native currency. Repeated account creation and wallet creation cannot grant more money.
- Security/listing separation and case-sensitive provider aliases with dated non-overlap, canonical mapping checks, namespace/listing locks, idempotent retries, audit and server-clock lookup. Ten aliases are explicitly fictional.
- Immutable reference snapshots, complete normalized MIC definitions/hashes, parent/diff history, future-effective promotion gates and audited classification/capability publication through a trusted operator CLI. The directory keeps all unknown classifications visible. Provider/dataset/feed/audience/retention/display/replay/simulation contracts independently default to disabled. See [catalog operations](catalog-operations.md).
- Persisted immutable calendar/rule versions, non-overlapping effective assignments, dated permission checks, listing halts and transactional publication audits back the scenario-rule panel. Tests cover breaks, holidays, early closes, overnight sessions, DST, Sunday trading weeks and exact lots/ticks/bands. See [market-policy implementation](market-policies.md); all ten seeded policies remain fictional.
- Account-bound synthetic FX quote/request contracts, exact exponent-aware rounding/remainders, five-minute validity and rejection of wrong-account, future/expired, dust or overflowing calculations. Wallet posting and executable conversion remain M2.
- Restricted local web database identity with actual privilege-denial checks, sanitized authentication logging, exact-origin configuration checks and OAuth state/failure/recovery fixtures against the real handler and MySQL. Operator/Docker credentials stay outside the web env. The owner confirmed historical credential rotation/revocation; this is recorded as attestation, not an independent issuer activity audit.

## Still open

- **M2 / #4:** order execution, idempotency and receipts, positions, executable virtual FX, journal posting and reporting valuation; durable workers are M6.
- **M3 / #5:** complete trading workbench and chart/order/portfolio interactions, broader accessibility checks and observed student walkthroughs.
- **M4 / #6:** intended-domain HTTPS OAuth verification, production identity/operator provisioning, factor/recovery operations, hosted database/TLS/grant/connection checks, ingress abuse controls, backups/restore, external audit retention and public deployment. Local operator grants/enrollment do not provision a hosted environment.
- **M5 / #7 and #9:** reviewed real venue calendars/rules, listing/provider capability evidence, permitted use, quota/freshness/outage verification and real-data enablement. All real simulation remains disabled.
- **Inventory #9 / M7:** full reviewed worldwide cash-equity classification and missing smaller/frontier/non-MIC markets. All 2,889 current reference rows are unreviewed. Version/diff software is implemented, but an actual prior effective source baseline has not been acquired. October changes become effective 26 October; the product discloses this upcoming-reference gap. Directory count is not a stock-exchange integration count.

Existing legacy endpoints have not been hardened; do not deploy them alongside the new app. Historical dependency advisories remain visible.

## Implementation decisions

For this slice, `mysql2` parameterized SQL and one checked-in SQL migration runner replace the proposed Drizzle candidate. Better Auth uses its supported MySQL/Kysely adapter. This keeps financial locking on a visible single connection and avoids two schema histories. It is an implementation decision, not an automatic rewrite of all proposed ADRs. TypeScript 6 is pinned because the chosen lint parser supports `<6.1`; TypeScript 7 is not part of the verified dependency combination. A minimal TypeScript/React-hooks lint configuration avoids a currently vulnerable transitive glob dependency in the framework lint preset. The new workspace audit reports zero advisories at the verification date; legacy dependencies are separate and unchanged.

The reference snapshot is loaded only by server/catalog code. The interactive explorer imports a separate lightweight fictional-scenarios entry point. No provider API keys or historical credentials are copied. No paid resource or public deployment was created.

See [local setup and environment contract](local-development.md), [M1 acceptance](m1-acceptance.md) and the earlier [foundation verification](verification.md). GitHub issues remain open until their own exit criteria are met.
