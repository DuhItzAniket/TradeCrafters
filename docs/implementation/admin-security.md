# Authenticator and administrator operations

This M1 slice adds account security and one privileged operation: pausing or resuming **new simulation opening grants**. It does not execute orders, move money or administer the worldwide catalog.

## Member setup

Sign in, then open **Account security**. Start setup within ten minutes of signing in; local password accounts also confirm their password. Scan the locally rendered QR with an authenticator app, save the recovery codes privately, and enter a current six-digit code to finish enrollment. Enrollment rotates the session; an unverified setup does not enable the factor.

QR data, authenticator keys, recovery codes and cookies must never enter issues, screenshots or logs. The authentication library encrypts the authenticator secret and recovery codes using the environment's authentication secret. Protect that secret and database backups together; changing it without a planned migration can make enrolled factors unusable.

Local password accounts must complete a second-factor challenge after password sign-in. A recovery code is single use. GitHub OAuth continues to use GitHub's own sign-in protection; the library's two-factor plugin does not automatically challenge OAuth login. TradeCrafters therefore verifies a separate authenticator code before every five-minute window of administrator access. Neither OAuth sign-in nor recovery-code sign-in grants that access.

The current UI supports enrollment and verification. Factor replacement, self-service recovery management and an assisted lost-device recovery process remain follow-up work. There is no public role-grant or MFA-reset endpoint.

## Explicit role bootstrap

An operator first verifies the intended user's identity through an independent trusted channel. The user must already have a verified provider identity and a verified authenticator enrollment. No default email, development account or first-user rule becomes an administrator.

Using the separately authorized operator database identity, find the intended internal user ID without publishing the user's email or authentication records:

```sql
SELECT id, name, emailVerified, twoFactorEnabled FROM user WHERE email = ?;
```

Then run from the repository root with Node 24:

```sh
npm run admin -- grant --user-id USER_ID --reason "Approved project owner administration"
npm run admin -- revoke --user-id USER_ID --reason "Administrator responsibility removed"
```

The commands validate prerequisites and record a reason in `security_audit`. Revocation removes the role and all saved step-up proofs. Supplying a browser role field or enrolling an authenticator cannot grant a role.

`OPERATOR_DATABASE_URL` optionally selects the operator identity for this CLI only. Keep it out of the web runtime. Locally, the generated development database identity also runs migrations; it is not a production privilege model. Hosted deployment must use separate migration/operator/runtime identities. The web identity needs reads on roles and insertion into audit records, but must not grant/revoke roles or update/delete audit history. Verify the complete table-level grants before deployment; they are an M4 gate.

## Privileged session verification

After a grant, reload **Account security** and enter a current authenticator code. The server checks the role, provider verification, enabled factor and current database session. Successful verification lasts five minutes for that session only. A code cannot be reused for another step-up during its validity window. Attempts have a persistent five-per-minute user budget in addition to the library's authentication limits.

Administrator reads check authorization on each request. The funding write rechecks role, identity, session validity and proof expiry inside its MySQL transaction. Expired or revoked access is denied even when the browser still shows controls. Disabling a factor, revealing its provisioning URI or regenerating recovery codes also requires a recent sign-in and current authenticator verification; those management operations are not yet exposed by the UI. Successful enrollment setup or disabling clears existing privileged proofs across that user's sessions.

## Funding pause and audit

An administrator can pause/resume new account funding with a 10–300 character operational reason. The control and its audit event commit atomically. New opening grants acquire a shared lock on that control before the account transaction; the pause update acquires the corresponding exclusive lock. After a pause completes, a new grant fails with `503 / SIMULATION_PAUSED`. Existing account reads/retries retain their balances, and adding an empty wallet cannot mint funds.

The page shows the latest 20 role/control audit events with UTC timestamps and reasons. Avoid private details in reasons. This application audit is not a tamper-proof external log: privileged database operators can modify it. Retention, operator attribution outside the database and centralized audit export belong to hosted operational hardening.

## Verification and remaining gates

See the [security verification record](security-verification.md). Local GitHub OAuth callback and reload persistence were verified with the owner on 20 October 2026. An actual HTTPS deployment, production callback, provider outage/recovery testing, owner MFA enrollment and explicit operator role provisioning remain separate gates. Do not mark all of M1 complete from this slice.
