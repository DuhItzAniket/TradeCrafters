# TradeCrafters

[![Global foundation checks](https://github.com/DuhItzAniket/TradeCrafters/actions/workflows/foundation.yml/badge.svg?branch=main)](https://github.com/DuhItzAniket/TradeCrafters/actions/workflows/foundation.yml)

**A global paper-trading laboratory built with Next.js, TypeScript and MySQL.** Originally created by **Aniket Kumar and Annapurna S** for a DBMS course, now being rebuilt around trustworthy accounts, explicit market coverage and a purposeful trading interface.

[Get started](#run-locally) · [Architecture](docs/architecture/README.md) · [Roadmap](docs/ROADMAP.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

The M1 global foundation is implemented in `apps/web` and `packages/`; see the [acceptance evidence](docs/implementation/m1-acceptance.md). It provides a working global explorer, a searchable **2,889-record worldwide MIC reference snapshot**, verified local GitHub sign-in, authenticator/admin controls and persistent native-currency wallets on MySQL. Ten clearly labeled fictional listings span six regions. **Order execution, virtual FX conversion, real-data integration and public deployment are still being built.** Directory presence is not verified exchange trading coverage.

<img src="docs/implementation/previews/foundation-desktop.png" width="1100" alt="TradeCrafters global market explorer with regional filters, venue and native-currency listing information, and a fictional scenario spotlight">

## Current capabilities

| Capability                                                     | Status                                                       |
| -------------------------------------------------------------- | ------------------------------------------------------------ |
| Responsive global explorer and disambiguated exchange listings | Working with fictional scenarios                             |
| Worldwide MIC reference search, filters and pagination         | 2,889 dated records; cash-equity classification remains open |
| Immutable reference versions/diffs and dated provider aliases  | Audited operator workflow; all real coverage stays unknown   |
| Server sessions, ownership checks and native-currency wallets  | Working locally with MySQL                                   |
| GitHub OAuth                                                   | Local callback and reload verified; production HTTPS pending |
| Authenticator, admin roles and audited funding pause           | Working locally; explicit operator provisioning required     |
| Versioned calendars, lots, ticks, bands and permission checks  | Ten fictional policies; real-market simulation disabled      |
| Exact account-bound FX quote and rounding contracts            | Verified calculation; conversion posting belongs to M2       |
| Order execution, holdings and explicit FX conversion           | Planned implementation                                       |
| Real exchange data and public deployment                       | Coverage, licensing and operational gates pending            |

## Run locally

Requires Node **24.22.0 LTS**, npm and Docker Desktop/Engine.

```sh
npm ci
npm run setup:local
docker compose --env-file .env.local up -d --wait
npm run db:migrate
npm run db:seed
npm run setup:db-identities
npm run dev
```

Open **http://127.0.0.1:3000**. Setup creates fresh ignored local credentials and separates the restricted web database identity from operator tooling. Local sign-up uses made-up test details; this mode is explicitly blocked in production. No market-data API key is required.

See the [complete setup and environment contract](docs/implementation/local-development.md), [admin/security runbook](docs/implementation/admin-security.md), [catalog operator workflow](docs/implementation/catalog-operations.md), [market policies](docs/implementation/market-policies.md), [implementation status](docs/implementation/foundation-status.md), and [M1 verification evidence](docs/implementation/m1-acceptance.md). The [project logo](apps/web/public/brand/tradecrafters-mark.png) is available for the GitHub OAuth app avatar.

## Project layout

| Path                      | Purpose                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------ |
| `apps/web`                | Next.js + React explorer, identity, wallets and same-origin APIs                     |
| `packages/domain`         | Exact currency/quote-unit arithmetic, opening-grant rules, calendar/rule validation  |
| `packages/contracts`      | Strict request validation                                                            |
| `packages/database`       | MySQL queries, authentication adapter, checked-in SQL migrations                     |
| `packages/market-catalog` | Dated worldwide MIC reference and separate fictional scenarios                       |
| `tests`                   | Domain and real HTTP/MySQL integration checks                                        |
| `docs`                    | Audit, provider research, global architecture, roadmap, design and execution records |
| `client`, `server`, `sql` | Preserved legacy coursework, separate from the new app                               |

## Direction and tracking

The scope is **stock exchanges worldwide**, including smaller and frontier markets. Global venue/listing identity and native currencies are part of the foundation. Real data will be enabled by verified provider coverage, permitted use and market-rule readiness; no universal free live feed is promised.

Start with the [research index](docs/README.md), [global architecture](docs/architecture/global-markets.md), [market-data comparison](docs/research/02-market-data.md), [roadmap](docs/ROADMAP.md), and [GitHub tracker #2](https://github.com/DuhItzAniket/TradeCrafters/issues/2).

The new workspace pins a supported stack, runs on Node 24, and emits a production build with a Vercel/Node-container path. A hosted MySQL database and registered OAuth application still need configuration and verification. No billable resource has been provisioned.

## Engineering workflow

Changes land through pull requests to protected `main`. Auto-merge is available for authorized PRs once the required `verify` check passes, the branch is up to date, and review conversations are resolved. The check covers tracked-source/credential patterns, clean installation, MySQL migrations and seed, restricted web DB provisioning, type/lint/format, 29 domain/configuration and 51 integration checks, a dependency audit, and a production build.

Read the [contribution guide](CONTRIBUTING.md), [security policy](SECURITY.md), [change history](CHANGELOG.md), and [local setup guide](docs/implementation/local-development.md) before making a change. Project status distinguishes verified behavior from work still on the roadmap.

## Legacy project

The original code remains available for reference. Its [audit](docs/research/01-current-state-audit.md) records authentication, accounting, setup and data-freshness gaps. Do not deploy the old server alongside the new app or reuse historical credentials. The [archived coursework README](docs/legacy-coursework-readme.md) preserves the original description; its live-data/JWT claims are historical intentions, not verified v2 behavior.
