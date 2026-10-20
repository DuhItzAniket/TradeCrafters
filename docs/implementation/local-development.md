# Run the global foundation

This additive implementation is under `apps/web` and `packages/`. The original `client/`, `server/` and SQL coursework remain separate. Do not import their credentials or point v2 at the old database.

## Local setup

Use **Node 24.22.0 LTS** (`.nvmrc`), npm, and a running Docker engine. Windows: start Docker Desktop first. The host's Node 25 is outside this project's supported runtime; select Node 24 with a version manager. You can also prefix npm commands with `npx --yes --package=node@24.22.0 npm` on this workstation.

From the repository root:

```sh
npm ci
npm run setup:local
docker compose --env-file .env.local up -d --wait
npm run db:migrate
npm run db:seed
npm run dev
```

Open **http://127.0.0.1:3000**, using that exact origin. Setup generates fresh secrets into ignored root/app `.env.local` files without printing values. Existing env files are preserved, never overwritten. If you change the root env, intentionally sync `apps/web/.env.local`; Next loads env from the app directory. No market-data API key is needed.

The directory imports 2,889 reference records; the ten example companies/listings/prices are fictional. Create a local test account using made-up email details and a new test password. Email ownership is not verified locally. Local credential mode requires `AUTH_DEV_CREDENTIALS=true`, localhost and a non-production process. It cannot be used for a production deployment.

Choose an initial reporting/wallet currency and create an account. Its only opening budget is equivalent to 100,000 virtual USD at the recorded **fictional** grant rate. JPY and KWD demonstrate zero/three decimal places. Adding another wallet starts at zero. Repeat requests retain the original account, reporting currency and funding. There is no account-reset, trading or FX-conversion endpoint yet.

## Commands

```sh
npm run typecheck
npm run lint
npm run format:check
npm test
npm run test:integration
npm run build
```

Integration checks require the local app and MySQL to be running. They create two isolated random test identities and remove only records they created. They cover actual HTTP/session/database boundaries, concurrency, grant reconciliation, ownership, CSRF, request bounds, directory SQL, rate budgets and session revocation. They do not verify a registered GitHub OAuth callback or exchange data.

`npm run build` checks production compilation. `npm start` runs the production build and intentionally rejects the local password configuration on requests. Configure production OAuth/HTTPS/DB first as below. Development HTTP integration tests use `npm run dev`; there is no production auth bypass for the tests.

## Database operation

The local database listens only on `127.0.0.1:3307`, with its own named Docker volume. Stop it with `docker compose --env-file .env.local stop`. `down` removes the container/network while retaining the volume. Do not delete the volume unless you intend to discard all local v2 accounts.

There is one versioned SQL history. The migration runner holds a MySQL named lock, checks file checksums and records completion. MySQL DDL is not transactional: an interrupted migration leaves an incomplete marker and must be inspected/restored/repaired before proceeding. Never edit a migration already applied to a retained database. Seeds are repeatable and do not touch user funds.

Auth SQL was generated from Better Auth 1.7.11 and reviewed for MySQL: explicit foreign keys were added because MySQL ignores inline `REFERENCES`; IDs/tokens use binary collation. The generation helper is development-only, refuses to overwrite the migration and requires a fresh empty database. Do not run automatic library migrations at app startup. Use separately authorized migration and app identities for hosted environments.

## Environment contract

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Dedicated v2 MySQL database; never the legacy database |
| `BETTER_AUTH_SECRET` | Fresh random secret, at least 40 characters; private per environment |
| `BETTER_AUTH_URL` | Exact origin, HTTPS in production; no wildcard preview trust |
| `AUTH_DEV_CREDENTIALS` | Explicit local-only test sign-up/sign-in; false/unset in production |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | Registered GitHub OAuth application; callback `<origin>/api/auth/callback/github` |
| `MYSQL_SSL` | Must be true for remote MySQL; certificate verification stays enabled |
| `MYSQL_SSL_CA_FILE` | Optional trusted provider CA file; never disable verification |
| `MYSQL_POOL_SIZE` | Per-process bound, 1–20; default 5; total instance count still needs a connection budget |
| `LOCAL_DB_PASSWORD`, `LOCAL_DB_ROOT_PASSWORD` | Docker-only generated credentials, not hosted secrets |

GitHub OAuth is configured in code but needs owner-created application credentials and a live callback test. Production account APIs require an email-verified provider identity. No email/password production enrollment, password recovery, admin grants or MFA workflow is exposed in this slice. Do not add public production password access without verification and recovery.

For Vercel, use the repository root for workspace install/build, framework Next.js, application root `apps/web`, Node 24, and the dedicated remote MySQL/auth variables in that environment. Verify the monorepo build settings with a preview before production. Managed MySQL must be network-accessible with TLS and near the function region; a default Vercel subscription does not itself provide this MySQL database. Isolate previews from production balances and OAuth apps. No cloud project or billable database was provisioned by this change.

For AWS/container hosting, the app emits Next standalone output. Build on the deployment OS. Copy `apps/web/.next/standalone` plus app static assets into the runtime and run `apps/web/server.js` inside that output with Node 24; use `HOSTNAME=0.0.0.0`. A full Docker image/TLS ingress/RDS deployment and backup restore runbook belong to M4. The Windows standalone output is not a portable Linux deployment artifact.

Both deployment paths still need public abuse/ingress checks, connection-budget validation, least-privilege DB credentials, secret rotation disposition, backup recovery, OAuth callback verification, and review of the remaining M1/M4 gates. A successful local build is not a public production readiness claim.
