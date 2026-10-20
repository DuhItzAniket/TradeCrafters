# M4 deployment foundations and release runbook

20 October 2026 (UTC verification date). **M4/#6 is in progress.** These changes prepare the existing synthetic application for deployment; no public deployment, hosted database or production identity has been provisioned. M3/#5 remains open for student walkthroughs, deferred by the owner while engineering proceeds.

## Implemented and measured

| Control                        | Evidence and limits                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bounded MySQL acquisition      | Two connections per production process by default, five locally; queue limited to 30. All promise queries/transactions and the authentication adapter's callback pool have a two-second acquisition deadline. Late acquisitions are released without executing the timed-out caller's statement. TCP connection timeout is five seconds. This is not a statement/transaction execution deadline.                                                                                                                                                     |
| Recoverable overload response  | The application API maps known acquisition/capacity/transport faults to sanitized `503 SERVICE_UNAVAILABLE`, `Retry-After: 1` and `Cache-Control: no-store`. Recover an unknown operation by its existing key before retrying. The auth library can handle its own errors internally; this does not promise every auth failure becomes 503.                                                                                                                                                                                                          |
| Verified TLS configuration     | Nonlocal MySQL requires TLS with certificate verification. A hosted PEM CA can be supplied through `MYSQL_SSL_CA`; an operator/container can instead use `MYSQL_SSL_CA_FILE`. Only one CA source may be configured. URL query options cannot silently change TLS configuration. Hosted handshake and certificate rejection still require the selected service.                                                                                                                                                                                       |
| Restricted grant contract      | Local provisioning and the read-only release inspector share `packages/database/runtime-grants.json`. Inspection rejects wildcard, extra, inherited-role and incomplete grants, checks required tables/columns and actual denials on migration history/MySQL account metadata. This has passed against the retained local runtime identity.                                                                                                                                                                                                          |
| Aggregate connection admission | Three independent pools requesting two connections each against a disposable MySQL user capped at four admitted exactly four and rejected two, in 11 ms in the recorded local rehearsal. The production preflight requires an actual `MAX_USER_CONNECTIONS` limit that fits beneath measured server capacity with an operator reserve. No hosted cap has been provisioned or measured.                                                                                                                                                               |
| Portable runtime               | A digest-pinned Node 24.22.0 Linux image builds only v2 inputs and runs the standalone app as UID 1000. Explicit COPY inputs and final build-context exclusions keep env files, legacy code and local state out. The smoke check scans the runtime for env files/legacy roots and starts it without database credentials.                                                                                                                                                                                                                            |
| Safe liveness                  | `GET /api/health` returns only `{"status":"ok"}`, with no database acquisition or configuration disclosure. It proves the HTTP process responds, not readiness of sign-in or trading. Readiness is an operator check.                                                                                                                                                                                                                                                                                                                                |
| Restore rehearsal              | A new disposable MySQL container on a random loopback port receives all eight migrations, catalog/rule seeds and fictional identity/session/factor records, buy/sell, FX and archive/reset activity. `mysqldump --single-transaction` is encrypted, read back, authenticated, and restored into a separate empty database. All **46 tables / 5,952 rows** match; migration checksums, archived receipt recovery, journal balance, wallet balances and position basis/realized P&L pass. Wrong keys and tampering fail before SQL is passed to MySQL. |

Recorded local drill at **2026-10-20T18:10:12Z**: encrypted artifact 1,443,831 bytes; backup/encryption 413 ms, restore/verification 673 ms, whole rehearsal 12.8 seconds. These are a small generated fixture on this machine, **not a production RPO/RTO, retention guarantee, load capacity or hosted disaster-recovery result**. Timing and row hashes change between runs. The ignored report is `.local/recovery/latest-report.json`.

The envelope uses AES-256-GCM with a fresh nonce and authenticated version header. The rehearsal uses an ephemeral random key, removes its encrypted file and temporary credential file, and removes only its own disposable container/tmpfs. It never reads local env files or restores into the owner's MySQL volume. Plaintext SQL stays in process memory/pipes; this bounded rehearsal has a 64 MiB subprocess buffer and is not a general large-database backup service. Independent key custody, protected storage, automated retention and provider restore operations are still release work.

## Commands

Use the pinned Node version from `.nvmrc` and run from the repository root:

```sh
# Retained local app runtime, without loading the root operator environment:
node --env-file=apps/web/.env.local --import tsx scripts/preflight.ts --local-fixture

# Generates its own isolated server and credentials; does not use .env.local:
npm run ops:recovery-drill

# No build-time database/OAuth credentials required:
docker build --tag tradecrafters:review .
npm run ops:container-smoke -- tradecrafters:review
```

The local inspector reports `scope: local fixture; not hosted acceptance`, no TLS, and no aggregate production budget. It must not be used to tick hosted acceptance boxes. The smoke container has no identity configuration and only tests liveness; a full authenticated journey remains a release gate.

For a configured hosted **runtime** env file, stored only under ignored `.local/hosting/`, use:

```sh
node --env-file=.local/hosting/preview-web.env --import tsx scripts/preflight.ts
```

That file must set `NODE_ENV=production`, the intended HTTPS `BETTER_AUTH_URL`, a new auth secret, a complete separate GitHub OAuth pair, `AUTH_DEV_CREDENTIALS=false`, the restricted remote `DATABASE_URL`, `MYSQL_SSL=true`, any required CA, and `MYSQL_POOL_SIZE=2`. `MYSQL_RESERVED_CONNECTIONS` is optional; its default reserves the greater of ten or one quarter of actual `@@max_connections`. Do not load root `.env.local` first or add operator/bootstrap credentials to the web env. No script prints connection strings, grant statements, user authentication metadata or raw driver errors.

The hosted inspector requires the exact table-level contract and a server-enforced user cap, verifies a live TLS session, and checks required schema/seed availability. It does not establish OAuth correctness, cookie scope, trusted ingress, expected regional latency, reconciliation of real hosted accounts or whole-service readiness. Run from the intended network path as well as operator tooling; successful access from a laptop does not establish Vercel egress access.

## Initial near-free hosting setup

The owner confirmed neither hosting nor a managed database is set up yet. The candidate remains **Vercel Hobby + Aiven free MySQL**, subject to actual account/region/privilege eligibility. Current official documentation was checked on 20 October 2026:

- [Vercel Hobby](https://vercel.com/docs/plans/hobby) is for personal noncommercial use. This project must remain within that use and plan limits; paid team collaboration is not assumed.
- [Aiven free MySQL](https://aiven.io/docs/products/mysql/concepts/mysql-free-tier) currently offers one node, 1 GB storage, backups and a 76-connection limit, with one free service of each type per organization. It has no VPC/forking/SLA and can be powered off for inactivity. The console's actual region, privileges, backups and recovery options must be checked before choosing it.
- [Vercel automatic scaling](https://vercel.com/docs/functions/concurrency-scaling) does not protect a small MySQL service simply because each process has a pool of two. Use a distinct capped runtime user for each permitted environment and budget their combined caps, deployments, operators and backup jobs. The connection limit is a safety ceiling, not sufficient protection against abusive requests.
- [Vercel runtime log retention](https://vercel.com/docs/limits) on Hobby is short. Do not describe it as an external audit archive. Protected audit export/storage and a retention/deletion policy remain open.

For example, on a confirmed 76-connection server, a runtime cap of 20 and reserve of 20 leaves 36 connections unallocated. That example is conservative arithmetic, not a provider limit already applied. A separate preview identity also consumes the same server budget. If the provider will not allow a verifiable user cap and required table grants, use a bounded container/proxy or another verified database plan; do not use the provider's operator identity in the web app.

Setup order:

1. Create the personal hosting and database accounts using their free plans. Do not activate trials/paid upgrades just to satisfy a checklist. Confirm the service region, MySQL version, CA certificate, available user-management privileges and restore controls.
2. Prepare a dedicated **preview database**, migration/operator credential and restricted web identity from the grant manifest. Apply migrations/seed using operator tooling only, then impose the connection cap. Preview and production data/credentials must be isolated; the single free service does not imply unlimited isolated preview databases.
3. Import this GitHub repository into Vercel with **Root Directory `apps/web`**, Next.js framework, Node 24, and access to workspace files outside that directory. Use the root lockfile/workspace install, default Next build and default output directory; do not deploy `client` or `server`. [Monorepo settings](https://vercel.com/docs/monorepos). Choose function region only after the actual DB location is known.
4. Establish an owner-controlled stable preview HTTPS address and create a **separate GitHub OAuth application** for it. Set its callback to `<exact-origin>/api/auth/callback/github`. Keep local OAuth unchanged and do not trust wildcard preview origins. Enter secrets directly into the preview environment; never into a PR, chat or tracked file. Do not expose production secrets to unreviewed PR/fork deployments.
5. Run runtime preflight, deploy a reviewed **preview**, and perform the intended-domain flow: sign in, denial/state/outage recovery, reload, native-currency trade, FX, receipt recovery, portfolio and session revocation. Provision hosted admin identity/factor/recovery independently. A container deployment needs an HTTPS reverse proxy/load balancer, ingress limits and secrets injected at runtime.
6. Record the exact commit, region, measured connection/request budget, tested certificate rejection, browser results, backup location/key custodian, restore/rollback results and actual monthly cost. Only expose a production release when the remaining gates below pass.

Do not pull hosted env values over either existing local env file. The root env contains operator tooling credentials; `apps/web/.env.local` contains the restricted local runtime. Neither is a hosted-template source.

## Remaining M4 acceptance

- Intended-domain hosted OAuth/cookies/denial/state/outage/reload/revocation and complete browser → API → MySQL → receipt/portfolio journey.
- Provider-specific migration/operator/runtime provisioning, live verified TLS plus rejected wrong CA/hostname, privilege denials and aggregate connection/request burst evidence on the actual service.
- Trusted ingress anonymous/read abuse controls and bounded counter retention; persistent local mutation/auth budgets alone do not complete this. Current auth IP handling still needs the selected ingress contract verified.
- An audited **execution** pause with transaction/race verification. The current admin control pauses **new funding/reset grants only**, and must not be presented as stopping existing accounts' trades or FX.
- Hosted admin enrollment, independent recovery procedure, secret/key custody and session revocation during recovery.
- Protected external audit retention/export, registration/retention/deletion policy, backup scheduling/retention, provider recovery and intended-release rollback rehearsal. Code rollback cannot reverse journal entries or MySQL DDL; older pre-M2 code cannot safely serve archived-account semantics.
- Review browser security policy and operational metrics/alerts after the deployment topology is known. Keep sanitized logs; never export raw auth responses, tokens or personal data.

No legacy endpoints, real provider feeds or real exchange permissions were enabled. Creator attribution remains **Aniket Kumar and Annapurna S**. Global real-market coverage remains M5/#7 and the worldwide inventory #9/M7; deferred student acceptance remains M3/#5.
