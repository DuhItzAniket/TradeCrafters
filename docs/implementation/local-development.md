# Run the global foundation

This additive implementation is under `apps/web` and `packages/`. The original `client/`, `server/` and SQL coursework remain separate. Do not import their credentials or point v2 at the old database.

## Local setup

Use **Node 24.22.0 LTS** (`.nvmrc`), npm, and a running Docker engine. Windows: start Docker Desktop first. The host's Node 25 is outside this project's supported runtime; select Node 24 with a version manager. On Windows, invoking `npm.cmd` through an `npx` Node package can still launch npm under the host runtime. To use the cached Node 24 package explicitly in PowerShell:

```powershell
$taskNpmCli = Join-Path (Split-Path (Get-Command npm.cmd).Source) 'node_modules/npm/bin/npm-cli.js'
npx.cmd --yes --package=node@24.22.0 node $taskNpmCli run typecheck
```

From the repository root:

```sh
npm ci
npm run setup:local
docker compose --env-file .env.local up -d --wait
npm run db:migrate
npm run db:seed
npm run setup:db-identities
npm run dev
```

Open **http://127.0.0.1:3000**, using that exact origin. `setup:local` generates fresh ignored configuration without printing values and preserves existing files. `setup:db-identities` provisions table-level web grants, reuses its generated password on repeat runs, updates the app's database URL and removes operator/Docker credentials from the app env. It preserves OAuth and auth secrets. No market-data API key is needed.

The two env files intentionally differ: root `.env.local` has the local operator `DATABASE_URL` and generated `LOCAL_RUNTIME_DATABASE_URL`; `apps/web/.env.local` has only the restricted web connection as `DATABASE_URL`. Next loads the app directory's env. Update shared authentication settings individually in both files; **do not copy the root file over the app file** or start the web process with the operator env preloaded. Restart the server after configuration changes.

The directory imports 2,889 reference records; the ten example companies/listings/prices are fictional. Create a local test account using made-up email details and a new test password. Email ownership is not verified locally. Local credential mode requires `AUTH_DEV_CREDENTIALS=true`, localhost and a non-production process. It cannot be used for a production deployment.

Choose an initial reporting/wallet currency and create an account. Its opening budget is equivalent to 100,000 virtual USD at the recorded **fictional** grant rate. JPY and KWD demonstrate zero/three decimal places. Adding another wallet starts at zero. Repeat creation requests retain the active account, reporting currency and funding.

Open **Practice trading** at `/trading`. Review and confirm a native-currency buy/sell; use explicit FX to fund a different currency first. Ten fictional listings use a fixed training clock of 20 October 2026, 10:15 local to each venue, with real-time quote expiry. This differs from the explorer's wall-clock policy preview. Receipts persist on MySQL; pending-intent recovery survives reloads in the same tab. **Start a new practice account** requires typing `RESET`, preserves archived history and grants one replacement account, at most once per hour. See the [trading/accounting contract](trading-accounting.md) before changing money, clocks or recovery behavior.

## Commands

```sh
npm run verify:source
npm run typecheck
npm run lint
npm run format:check
npm test
npm run test:integration
npm run build
```

The suite has **38 domain/configuration tests and 70 integration checks**. Integration requires the local app, migrated/seeded MySQL, restricted web identity and Docker access for local failure-injection fixtures. Tests create isolated random identities and disposable listing/policy/catalog fixtures, restore the funding pause control and remove only records they created. They cover HTTP/session/database boundaries, concurrent grant/trade/FX/reset reconciliation, exact native basis/P&L, quote expiry, crash and SQL rollback, unknown-response recovery, ownership/CSRF/input/rate limits, revocation/MFA/roles, policies, alias races, immutable source versions, expiring evidence, OAuth failure/recovery and actual database privilege denials.

OAuth transport fixtures exercise the real auth handler and MySQL without live GitHub traffic; an owner-assisted real local callback was verified separately. The automated suite does not establish hosted HTTPS behavior or exchange-data rights. See [M2 acceptance and limits](m2-acceptance.md), [M1 evidence](m1-acceptance.md), [market policies](market-policies.md) and [catalog operations](catalog-operations.md). `npm run catalog -- status` reads the reference/coverage summary using the root CLI identity.

`npm run build` checks production compilation. `npm start` runs the production build and intentionally rejects the local password configuration on requests. Configure production OAuth/HTTPS/DB first as below. Development HTTP integration tests use `npm run dev`; there is no production auth bypass for the tests.

## Database operation

The local database listens only on `127.0.0.1:3307`, with its own named Docker volume. Stop it with `docker compose --env-file .env.local stop`. `down` removes the container/network while retaining the volume. Do not delete the volume unless you intend to discard all local v2 accounts.

There is one versioned SQL history, now through `0008_trading_accounting.sql`. The migration runner holds a MySQL named lock, checks file checksums and records completion. MySQL DDL is not transactional: an interrupted migration leaves an incomplete marker and must be inspected/restored/repaired before proceeding. Never edit a migration already applied to a retained database. Seeds are repeatable and do not touch user funds. Rerun `setup:db-identities` after upgrading so runtime grants include the new accounting tables. M1 code is not a safe downgrade after accounts have been archived; see the [M2 upgrade/rollback contract](trading-accounting.md#upgrade-and-rollback).

Auth SQL was generated from Better Auth 1.7.11 and reviewed for MySQL: explicit foreign keys were added because MySQL ignores inline `REFERENCES`; IDs/tokens use binary collation. The generation helper is development-only, refuses to overwrite the migration and requires a fresh empty database. Do not run automatic library migrations at app startup.

The local web identity reads catalog/roles, inserts audit and opening journals, and has only the table operations needed for accounts/auth/funding controls. It cannot grant roles, rewrite journals/audits/catalogs, read migration history or change schema. `setup:db-identities` operates only on the local Docker MySQL service, using its existing container credentials without exposing them. Root CLI credentials remain privileged for local migrations/operator work. Hosted migration/operator/runtime identities, TLS and verified grants must be provisioned separately in M4; the local helper does not configure a remote database.

## Environment contract

| Variable                                      | Purpose                                                                                                       |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                | Dedicated v2 MySQL: local operator in root env, restricted runtime in app env; never the legacy database      |
| `BETTER_AUTH_SECRET`                          | Fresh random secret, at least 40 characters; private per environment                                          |
| `BETTER_AUTH_URL`                             | Exact origin, HTTPS in production; no wildcard preview trust                                                  |
| `AUTH_DEV_CREDENTIALS`                        | Explicit local-only test sign-up/sign-in; false/unset in production                                           |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`    | Registered GitHub OAuth application; callback `<origin>/api/auth/callback/github`                             |
| `MYSQL_SSL`                                   | Must be true for remote MySQL; certificate verification stays enabled                                         |
| `MYSQL_SSL_CA_FILE`                           | Optional trusted provider CA file; never disable verification                                                 |
| `MYSQL_POOL_SIZE`                             | Per-process bound, 1–20; default 5; total instance count still needs a connection budget                      |
| `OPERATOR_DATABASE_URL`                       | Optional separately privileged connection for `admin`/`catalog` CLIs; never provision it to the web runtime   |
| `LOCAL_RUNTIME_DATABASE_URL`                  | Generated local web connection retained only in root env for setup/verification; not a hosted secret contract |
| `LOCAL_DB_PASSWORD`, `LOCAL_DB_ROOT_PASSWORD` | Docker-only generated credentials, not hosted secrets                                                         |

For local GitHub OAuth, register an OAuth application with homepage `http://127.0.0.1:3000` and redirect URI `http://127.0.0.1:3000/api/auth/callback/github`. Copy the application's **Client ID** into `GITHUB_CLIENT_ID`, generate a separate **Client Secret** for `GITHUB_CLIENT_SECRET`, and save both in root `.env.local` and `apps/web/.env.local`. Keep wildcard matching and device flow off. Restart the dev server after editing OAuth configuration, then use **Continue with GitHub**. Never paste the secret into an issue or chat.

Local owner-assisted OAuth callback and reload persistence were verified; production still needs its own registered application and live HTTPS callback test. Production account APIs require an email-verified provider identity. See [authenticator setup and explicit operator grants](admin-security.md). No email/password production enrollment, password recovery or public role-grant endpoint exists. Do not add public production password access without verification and recovery.

For Vercel, use the repository root for workspace install/build, framework Next.js, application root `apps/web`, Node 24, and the dedicated remote MySQL/auth variables in that environment. Verify the monorepo build settings with a preview before production. Managed MySQL must be network-accessible with TLS and near the function region; a default Vercel subscription does not itself provide this MySQL database. Isolate previews from production balances and OAuth apps. No cloud project or billable database was provisioned by this change.

For AWS/container hosting, the app emits Next standalone output. Build on the deployment OS. Copy `apps/web/.next/standalone` plus app static assets into the runtime and run `apps/web/server.js` inside that output with Node 24; use `HOSTNAME=0.0.0.0`. A full Docker image/TLS ingress/RDS deployment and backup restore runbook belong to M4. The Windows standalone output is not a portable Linux deployment artifact.

Both deployment paths still need public abuse/ingress checks, connection-budget validation, independently provisioned least-privilege DB credentials, hosted secret management, backup recovery and HTTPS OAuth callback verification under M4. The owner confirmed historical credential revocation/rotation; see the [attestation and M1 acceptance](m1-acceptance.md). A successful local build is not a public production readiness claim.
