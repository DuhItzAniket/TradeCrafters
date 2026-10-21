# Release and incident operations

Scope: the personal Vercel Hobby/Aiven Free synthetic demo. Operators keep credentials, identity proof and backup keys private. [Data lifecycle](data-lifecycle.md) defines retention and the limits of public registration/monitoring. [Hosted recovery](hosted-recovery.md) records measured restore/capacity results.

## Release

1. Review the exact PR head. Required CI must pass; keep main protection, review/conversation gates and normal auto-merge. Never bypass a failed check. Confirm the intended project `tradecrafters-preview`, stable Production origin `https://tradecrafters-preview-gamma.vercel.app`, and actual function/database regions Mumbai/Bangalore.
2. Retrieve the independently held encrypted backup/key and auth secret. Take a new encrypted checkpoint before migrations. Retain its reviewed code commit: restoration requires that commit's exact migration manifest, followed by forward migrations. Never change an applied migration checksum.
3. Apply additive schema changes with the separately capped migration identity. Inspect completion markers and checksums. A failed DDL step is not transactionally undone; inspect it before any retry. Check exact runtime grants/TLS/cap, enabled maintenance, reconciliation and current execution flags. Do not import operator files into Vercel.
4. Merge the reviewed commit normally. Wait for the actual Production deployment to become Ready and verify its source commit. GitHub's Vercel status can lag the dashboard; avoid redundant manual builds. PR previews have no Production database/auth secrets.
5. Run `npm run ops:public-smoke`, inspect the actual browser workbench/chart/security pages and fixed-scope API diagnostics. Verify the saved-receipt journey after any financial change. An unknown write is recovered with its original operation key; a retry must not create a second fill/conversion.
6. Record the deployed commit, acceptance evidence and limitations. Preserve the immediately previous compatible Production deployment for the rollback exercise. Do not select historical pre-M2 code that cannot interpret archived-account semantics.

## Code rollback and return to automatic deployment

In Vercel, select the current project and inspect the source commit/environment of the immediately previous **Production** deployment. Hobby rollback availability is limited; see [Vercel rollback](https://vercel.com/docs/instant-rollback). Review schema compatibility, current backup and pending writes before changing the stable alias.

Use **Instant Rollback** to the reviewed compatible Production target. Recheck health, directory/chart, anonymous denial, security headers and database reconciliation at the stable URL. Rollback changes code/alias, not database schema, user balances, journals, environment values or provider credentials. If compatibility cannot be established, pause execution and fix forward.

Rollback disables automatic Production domain assignment. After the drill/incident, **Promote to Production** the intended Ready **Production** build, verify its commit and stable URL again, then verify automatic assignment is restored in the dashboard. Promoting a Preview can rebuild with different Production variables; it is not promotion of the tested Production build. Never assume a green GitHub check identifies the live alias.

## Restore

For corruption/credential incidents, pause execution/funding, restrict access, preserve the evidence and recover independent custody first. Provision a new isolated replacement database with verified TLS and scoped identities; never restore over the only live source. Use the archive's matching reviewed checkout to authenticate/restore it, compare all fingerprints/FKs/accounting, discard restored session/state/provider-token authority and rebuild reviewed guards/expiry jobs. Apply forward migrations, reapply completed-deletion cases, reconcile, provision exact capped runtime grants and run intended-origin acceptance before changing the web DATABASE_URL.

The tested rehearsal creates/deletes only its own new `tc_restore_…` schema/user and exposes no route. It does not provision a replacement cloud provider or promise regional failover/PITR. Aiven Free's disabled Fork control must not be represented as a successful provider PITR rehearsal. The portable encrypted restore is the supported tested application recovery path. Protect keys/auth secret separately and test retrieval periodically.

## Audit anchor check

Before replacing a retained external checkpoint, select its encrypted archive in `AUDIT_ANCHOR_ARCHIVE` and run, with the private read/operator backup configuration:

```sh
node --env-file=.local/hosting/m4-recovery.env --import tsx scripts/check-audit-anchor.ts
```

This authenticates before decoding, compares every retained audit row/column by ID against a consistent read-only current snapshot, permits appended records and fails on missing/rewritten history. It prints counts/outcome only and never executes SQL from an archive. It supports a pre-expiry migration-16 archive because audit comparison is data-only; **general restore still requires exact migration/checksum matching**. A missing/deleted key or overwritten independent archive defeats this protection. Do not replace the only known-good anchor following a mismatch; investigate and retain both versions privately.

## Incident triage

| Signal                                       | Action                                                                                                                                                                       |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Smoke liveness passes, directory/chart fails | Treat as dependency/readiness incident. Inspect Aiven Running state, connection ceiling, TLS, scheduler and sanitized API status/duration. Do not raise pool limits blindly. |
| Repeated 429                                 | Honor Retry-After; inspect scoped admission counts. Do not trust caller-forwarded IP headers or disable limits.                                                              |
| 503 / lost mutation response                 | Recover the original operation key first. Reconcile journals/wallets before allowing a new operation.                                                                        |
| GitHub unavailable / OAuth rejected          | Preserve the account, show retryable sign-in failure and wait for provider recovery. No production password/identity bypass.                                                 |
| Suspected owner/factor compromise            | Independently verify ownership and use the audited [recovery procedure](owner-recovery.md); revoke role/sessions first. Never request codes in chat.                         |
| Audit anchor mismatch / unreconciled ledger  | Retain both encrypted artifacts, pause changes, inspect through private operator tooling and restore/fix forward only after review.                                          |

The public smoke is a six-hour sampling check, not continuous uptime monitoring or a delivery SLA. Workflow failures are visible in GitHub Actions; owner notification preferences control delivery. Application metrics contain fixed scope/status/duration only. Health is intentionally database-free and cannot establish sign-in/trading readiness by itself.

## Observed rollback rehearsal — 21 October 2026 UTC

At 18:37 UTC, Instant Rollback moved the stable Production domain from reviewed main `6de1ab0bcc406001c6ddf1cf550de355dbb978a8` (`JeguuvEWdUZHb2GheDV9DDMy43y5`) to the immediately previous compatible Production build `765ee301b3b29804051fc2694b969e3a5606a652` (`Ej8LVh9zNskzZwuMaPPdpEXTRA6T`). The application/runtime package trees were identical; changes were operator recovery/migration tooling and docs. The additive migration-16 schema was compatible, and the independently retained encrypted checkpoint was available.

Before, during and after rollback, actual health/home/sign-in/directory/chart responses were 200, anonymous portfolio was 401 and responses were no-store with Mumbai routing. Promotion returned the exact Ready `6de1ab0` Production build to the stable domain. The dashboard's **Auto-Assign Custom Production Domains** checkbox was verified enabled; the project overview again instructed pushes to main to update Production. Read-only accounting at 18:40:48Z still reconciled one account/two wallets/five journals/two positions and fills/five operations. No journal, schema, credential, owner factor or session was rolled back. Private screenshots retain the alias/automatic-assignment observations.
