# TradeCrafters: modernization research

**Research date:** 20 October 2026 · **Stage:** proposal; no application rewrite or deployment yet.

TradeCrafters began as a DBMS course project by **Aniket Kumar and Annapurna S**, using React, Node.js, MySQL, and Alpha Vantage. The next version should be a credible place to practice trading: understandable orders, consistent accounting, honest data freshness, and a focused trading workspace.

The project owner's direction is **US stocks first, Indian markets later, with a free or near-free portfolio-project budget**. This package turns that direction into reviewable engineering and design work.

Review [draft PR #1](https://github.com/DuhItzAniket/TradeCrafters/pull/1); use [tracker #2](https://github.com/DuhItzAniket/TradeCrafters/issues/2) for the linked implementation backlog. No implementation task has been marked complete by the research phase.

## Recommended direction

- Build a **TypeScript modular monolith**: Next.js for React UI and same-origin API routes; MySQL/InnoDB for durable state; a supported authentication library for server-verified sessions. Keep trading rules independent of the web framework.
- Keep **MySQL**. A change of database is not necessary to fix the current correctness problems. Aiven's free MySQL tier is a plausible demo host; its developer tier is a small paid step up. See the [deployment plan](architecture/deployment-and-operations.md) for constraints.
- Ship a **clearly labeled synthetic practice market** for the public, near-free demo. Add a small real-US-equity universe only after confirming the provider permits this simulator's display, execution, and retention uses. Keep each data mode in a separate simulation account.
- Investigate **Alpha Vantage's educational/open-source allowance** before discarding it; evaluate **Alpaca** for private US-market development and **Twelve Data** for a possible licensed public-data path. Higher quotas alone do not settle public display rights. See [market-data research](research/02-market-data.md).
- Start with whole-share, cash-only market orders and explicit fill receipts. Add resting limit orders only when a continuously operating evaluator is funded and tested.
- Design a **trading workbench** with a watchlist, one dominant chart, an order ticket, and positions/activity. The [design study](design/workbench.html) is a visual specification using fictional data, not a functioning trading application.

## Read in this order

| Document | Purpose |
| --- | --- |
| [Current-state audit](research/01-current-state-audit.md) | Source-backed bugs, vulnerabilities, reproducibility gaps, and dependency evidence |
| [Market-data options](research/02-market-data.md) | Provider comparison, quotas, permissions, Indian-market constraints, and cost control |
| [Product and experience](research/03-product-and-experience.md) | Audience, competitor lessons, scope, workflows, and UI specification |
| [Design study and screenshots](design/README.md) | Original workbench concept, mobile/light previews, and instructions to try it |
| [Architecture](architecture/README.md) | Alternatives, recommended components, boundaries, and request flows |
| [Trading and data model](architecture/trading-and-data-model.md) | Accounting, fill rules, schema, contracts, and concurrency guarantees |
| [Deployment and operations](architecture/deployment-and-operations.md) | Vercel, AWS, costs, security controls, observability, and migration |
| [Decisions](DECISIONS.md) | Proposed ADRs and unresolved decisions |
| [Roadmap](ROADMAP.md) | Sequenced milestones, acceptance criteria, estimates, and GitHub workflow |
| [Sources](research/SOURCES.md) | Official references, access date, and research limitations |

## What the audit establishes

The GitHub baseline is [`8fa0265`](https://github.com/DuhItzAniket/TradeCrafters/tree/8fa026527631bbfa51bcd0ba5e3412eaa8df5b16). Its login response establishes no server session; trade requests supply their own identity and execution price. A database module imported by both controllers is missing from Git. The frontend and portfolio API disagree about their response contract. These findings make authentication and accounting the first implementation gates.

The dependency snapshot reports **13 affected packages in the server lockfile and 108 in the client lockfile**. These are audit results, including transitive and tooling dependencies, not counts of proven exploitable endpoints. Read the [audit scope and evidence](research/01-current-state-audit.md#dependency-snapshot) before interpreting them.

An older ZIP retained in Git history contains non-placeholder configuration secrets. Their validity is unverified; treat them as exposed and rotate/revoke before reuse. The audit includes sanitized evidence only.

## Scope of this delivery

Completed: repository review, official-source research, isolated legacy logic probes, dependency audit, proposed architecture, domain rules, deployment paths, product/design brief, design study, and implementation roadmap. Application behavior remains unchanged. No cloud resources, provider accounts, paid subscriptions, or production migrations have been created.

Open decisions: approve the design direction; confirm educational/data entitlements; select the exact deployment region after database provisioning options are known. Exact framework and library versions must be resolved and audited at implementation time.
