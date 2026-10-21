# Independent owner recovery

This is an operator procedure for the repository owner's hosted GitHub identity. It adds no public reset endpoint, email-based bypass, password sign-in in production or automatic role grant. Other members' self-service factor replacement is not implemented by this command.

## Authority and review

Recovery requires control of two independent systems: authenticated GitHub CLI access as this repository's owner, and separately held database operator access with verified TLS. `scripts/recover-owner.ts` checks that the authenticated GitHub ID equals the repository owner ID and the reviewed target provider ID. The database operation additionally requires exactly one matching GitHub account mapping to the specified application user. A browser role, display name, email, recovery request or successful OAuth session alone is insufficient.

The operator must independently review the case before execution. A manifest's `ownerReviewed: true` is the operator's assertion that this occurred; the field itself is not human authorization or an approval mechanism. An agent must not infer permission to reset a real person's factor from a manifest or test fixture. The recovery tests do not reset the owner's enrolled authenticator.

Keep the case manifest, its UUID, identity proof and operator credentials private. Never put provider/session tokens, factor secrets or recovery codes in a case reason, issue or screenshot. Record who reviewed the case in owner-controlled records outside the database. The application audit alone cannot prove which human used a privileged database credential.

## Procedure

1. Confirm the incident and ownership through GitHub and independent infrastructure access. If GitHub itself is unavailable or its account is compromised, use the provider's recovery process first. Do not enable development passwords or accept a claimed email as a workaround.
2. Retrieve the independently held backup key and hosted authentication secret. Check the latest encrypted backup and its migration version before making changes. See the [hosted recovery contract](hosted-recovery.md); older archives require their matching reviewed checkout before forward migration.
3. Prepare a private `.local/hosting/owner-recovery-case.json` containing `userId`, the independently verified numeric `githubId`, a fresh UUIDv4 `caseKey`, exact `host`/`database`, `action: "revoke-role-sessions-and-factor"`, and `ownerReviewed`. Review the exact target and expected revocations before marking it true. Never reuse another identity's case.
4. In a dedicated operator environment, set `RECOVERY_OPERATOR_DATABASE_URL`, verified MySQL TLS/CA configuration and `AUTH_DEV_CREDENTIALS=false`. These credentials stay outside Vercel and both retained local app environments. Run with Node 24.22.0:

   ```sh
   node --env-file=.local/hosting/owner-recovery.env --import tsx \
     scripts/recover-owner.ts --execute-reviewed-owner-recovery \
     .local/hosting/owner-recovery-case.json
   ```

5. Confirm the committed result and its protected external audit copy. If the response is lost or the result is uncertain, retain the manifest and run the **same case key**. A successful replay returns its prior completion without resetting a newly enrolled factor. Do not generate a replacement case just to retry.
6. Old captured cookies must fail on account/security/portfolio/admin routes. Fresh provider sign-in permits normal account access but restores no administrator role. Enroll and verify a **new authenticator**, save new recovery codes privately, and obtain an independently reviewed grant through the existing [administrator procedure](admin-security.md). A current authenticator proof is still required for administrator access. Old enrollment material and backup codes do not transfer to the new factor.
7. Reconcile virtual balances/positions/receipts and verify that execution/funding flags were not changed. Close the external case only after the owner can sign in, use the new factor and recover intended access.

## Atomic revocation contract

Migration 0016 adds an `identity_recovery` action and unique private case key. The operator transaction locks the subject identity, validates the provider mapping and checks for an existing completed case. It revokes the role, all sessions/step-up proofs, bound pending second-factor/trusted-device state and the old factor/backup codes; it clears the factor flag and saves the reasoned audit event in the same commit. It touches no practice account, quote, receipt, wallet, position or global control.

Recovery has no dependency on a still-working lost authenticator. It also grants no substitute session or proof. An audit failure rolls back all revocations. The unique case key makes committed-result recovery safe after a lost response. Independently holding the database/authentication keys remains essential; there is no promise of recovery if every authority and backup is lost.

## Verification

Three local real-HTTP/MySQL regressions passed with explicitly fictional provider/factor fixtures:

- A wrong provider mapping rejects before mutation; correct recovery revokes only the subject. Another identity stays authorized. Captured cookies fail across protected routes; retrying the completed case preserves a fresh fixture factor/session and restores no role.
- A fixture-only audit append failure after the revocations causes a real database rollback. The previous session, role, factor and trusted-device records remain valid together.
- An actual administrator HTTP write is observed waiting on the control row through MySQL's lock-wait tables. Recovery commits while it waits; after release the write returns 403 and both global flags remain unchanged.

These fixtures prove database/API behavior, not an actual person's provider identity, secret custody or human lost-device experience. Hosted rehearsal and exact release evidence must be recorded separately before closing M4. The owner's existing authenticator remains untouched by implementation/testing.
