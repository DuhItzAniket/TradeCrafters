# M1 checkpoint — paused 20 October 2026

Paused at the owner's request before going offline. **M1 remains open.** This is a local work-in-progress checkpoint; the changes have not been pushed or merged. The merged baseline is PR #16 (`e0fd521`). Resume on branch `feat/m1-catalog-integrity`.

## Saved implementation

- Provider-alias publication with namespace/listing locks, case-sensitive identifiers, non-overlapping date windows, idempotent retries, audits and a server-clock lookup API. Ten fictional aliases are seeded.
- Immutable reference snapshots, source hashes, operating/segment validation, dated promotion and added/removed/changed diffs. Classification reviews and provider/dataset/use capability contracts have audited operator CLI operations. Coverage reads retain all 2,889 records and keep the unreviewed universe and disabled real simulation explicit.
- Directory classification filters, review counts and source metadata from the registered reference snapshot.
- Account-bound synthetic FX quote/request contracts, exact native-currency conversion arithmetic, validity bounds and disclosed rounding. No FX or order execution endpoint exists.
- Exact-origin OAuth configuration checks, boolean provider readiness, sanitized application authentication logging and isolated provider-failure/recovery tests using the real auth handler and MySQL with fixture transport.
- Separate local web database identity with table-level grants. The web cannot grant administrator roles, rewrite catalog/audit/journal history, access migration history or create schema. Operator/root CLI credentials and OAuth values were preserved.
- Tracked-source/credential-pattern CI check and expanded integration workflow.

## Local state and verification

Migrations **0006 and 0007 are already applied** to the retained local MySQL database; do not edit them. Catalog/policy/alias seeds are applied. The dev server is running on `http://127.0.0.1:3000` with Node 24 and the restricted web identity.

Root `.env.local` retains the operator development `DATABASE_URL`; generated `LOCAL_RUNTIME_DATABASE_URL` records the separate web connection. `apps/web/.env.local` uses that restricted connection as `DATABASE_URL`. Both files remain ignored. Preserve this deliberate difference when syncing environments. No credential value belongs in this record.

- Latest domain run: **29/29 passed**.
- Latest combined integration run: **50/51 passed**. It exposed a permission mismatch in empty-wallet creation. That path was changed to a shared account lock, then the complete original account/security suite passed **19/19** with the restricted web identity. Alias (7), inventory (7), OAuth fixture (7), policy (8) and database privilege (3) checks also passed in their respective runs. **One final combined integration run is still required.**
- Type checking and lint passed before the final shared-lock change; rerun final checks against the checkpoint head. The source-pattern check and final formatting/build/CI remain to be verified.
- Browser directory selection of “Awaiting review” works; desktop width 1,440 had no page overflow. Complete mobile/tablet, console, screenshots and browser verification after resuming.

The owner confirmed privately in this chat that historical Alpha Vantage/database credentials were revoked or rotated. This is owner attestation, not an independently performed provider/account audit. No historical credential was reused.

## Resume work

1. Inspect this branch and existing local state. Keep migrations and owner accounts intact.
2. Finish browser QA and final combined tests, static/source checks, production build and audit. The setup sequence now includes `npm run setup:db-identities` after migrations/seed; it preserves OAuth configuration and reuses the generated local web password.
3. Review the new contracts, transaction/permission boundaries and tests. Finish the operator guide, setup/README/changelog, credential-disposition note and M1 acceptance evidence.
4. Reconcile M1 acceptance with the original foundation/contracts scope. Keep deployment/HTTPS operational gates in M4 and evidence-backed real worldwide classification/entitlements in M5/#9/M7 explicitly open. Do not count fictional fixtures or a directory as verified real-exchange coverage.
5. Create/attach a reviewable PR, run required CI, enable the previously authorized auto-merge and update GitHub tracking only after verification. No PR has been created for this checkpoint. Do not close M1 until its acceptance review is complete.

No cloud resource, paid service or public deployment was created. The user's pause revokes further execution until they resume.
