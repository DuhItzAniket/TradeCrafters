# Foundation execution status — 20 October 2026

This records the foundation, account-security and market-policy implementation slices of [M1 / #3](https://github.com/DuhItzAniket/TradeCrafters/issues/3), with initial discovery and inventory work from #5/#9. It is not completion of the roadmap or every M1 exit criterion.

## Implemented

- Additive npm workspaces; Node 24 LTS, Next 16.4.2, React 19.3.1, TypeScript 6.0.3, Better Auth 1.7.11 and MySQL 8.4. Exact package lock, repeatable local setup, tracked SQL source and CI workflow.
- Designed responsive global explorer, selected-listing detail, worldwide venue search/filter/pagination, local sign-in and persisted account/wallet screens. Creator credit remains Aniket Kumar and Annapurna S.
- Official 2,889-record ISO MIC snapshot, with operating/segment identities, expired/non-equity facilities retained and publication/effective dates disclosed. Ten fictional scenarios cover six regions; ATLS disambiguates unrelated securities in London and Australia.
- Database-backed sessions and rate limits, immediate revocation checks (no cookie session cache), exact origin/CSRF checks for mutations, strict bounded account/wallet input, session-derived ownership and sanitized application errors. GitHub OAuth wiring; local-only password mode fails closed in production.
- Owner-assisted local GitHub OAuth callback and reload persistence verified. Authenticator enrollment with locally rendered QR and single-use recovery codes; explicit operator role grants; five-minute session-specific admin verification; audited pause/resume of new simulation funding. See the [operator runbook](admin-security.md) and [security verification](security-verification.md).
- Owner local authenticator enrollment, session verification and explicit operator administrator grant completed. Protected administrator controls loaded successfully in the owner's browser; the grant is recorded in the local audit log.
- Native wallets and exact bigint/minor-unit helpers, zero/two/three currency exponents, GBX/ZAC quote multipliers, one fixed synthetic USD-equivalent opening grant with immutable rate provenance, one grant journal and balanced entries in its native currency. Repeated account creation and wallet creation cannot grant more money.
- Security/listing separation, dated alias schema and unknown/disabled real-simulation capability records. Persisted immutable calendar/rule versions, non-overlapping effective assignments, dated permission checks, listing halts and a transactional publication audit now back the scenario-rule panel. Tests cover breaks, holidays, early closes, overnight sessions, DST, Sunday trading weeks and exact lots/ticks/bands. See [market-policy implementation](market-policies.md); all ten seeded policies remain fictional.

## Still open

- End-to-end verification of GitHub OAuth on the intended HTTPS domain; production identities and provider failure/recovery behavior.
- Production identity/operator provisioning, self-service factor management and assisted recovery, hosted database privilege separation and external audit retention. The implemented admin API currently controls only new opening grants.
- Reviewed real venue calendars/rules and provider capability/entitlement evidence. The versioned schema and publication/read gates are implemented with fictional fixtures; real simulation and order execution remain disabled. Alias-overlap enforcement and a complete operator catalog workflow remain future work.
- Full reviewed worldwide **cash-equity** classification and effective-dated prior-baseline/diff handling. The newly retrieved October MIC publication has changes effective 26 October, so it is an upcoming reference snapshot only. Directory count is not a stock-exchange integration count.
- Actual order execution, order idempotency and receipts, positions, explicit virtual FX conversion, reporting-currency valuation and durable workers (M2 onward).
- Public deployment, cloud credentials, TLS/ingress and connection-budget checks, credential-rotation disposition, persistent anonymous abuse controls at the trusted ingress, retention/backup restore and operational gates. Existing legacy endpoints have not been hardened; do not deploy them alongside this app.

## Implementation decisions

For this slice, `mysql2` parameterized SQL and one checked-in SQL migration runner replace the proposed Drizzle candidate. Better Auth uses its supported MySQL/Kysely adapter. This keeps financial locking on a visible single connection and avoids two schema histories. It is an implementation decision, not an automatic rewrite of all proposed ADRs. TypeScript 6 is pinned because the chosen lint parser supports `<6.1`; TypeScript 7 is not part of the verified dependency combination. A minimal TypeScript/React-hooks lint configuration avoids a currently vulnerable transitive glob dependency in the framework lint preset. The new workspace audit reports zero advisories at the verification date; legacy dependencies are separate and unchanged.

The reference snapshot is loaded only by server/catalog code. The interactive explorer imports a separate lightweight fictional-scenarios entry point. No provider API keys or historical credentials are copied. No paid resource or public deployment was created.

See [local setup and environment contract](local-development.md) and the [verification record](verification.md). GitHub issues remain open until their full exit criteria are met.
