# Proposed decisions

**Execution note, 20 October:** the first slice implements the modular Next.js/TypeScript/MySQL direction with Better Auth database sessions, `mysql2` parameterized SQL and a single SQL migration history. Drizzle remains an unselected candidate; it is not part of the installed stack. TypeScript 6.0.3 matches the supported lint parser. See [implementation decisions and remaining gates](implementation/foundation-status.md). This records implementation evidence, not production deployment or data-provider approval.

All ADRs below are **proposed**, pending review. The owner's clarified scope is **all stock exchanges globally**, with free/near-free prototype cost. The earlier US-first/India-later assumption is superseded. Architecture choices do not imply permission to buy a service or publish market data.

| ADR | Proposed choice | Why | Revisit when |
| --- | --- | --- | --- |
| 001 | Modular monolith with separate domain modules | One small team can reason about transactions and deploy one app | A measured scaling/ownership boundary makes extraction useful |
| 002 | Keep MySQL/InnoDB | Preserves the course project's relational foundation; supports required integrity | Hosting constraints or a concrete database feature justify a dialect migration |
| 003 | Next.js + TypeScript for the new app | Same-origin UI/API, contracts, Vercel path, container option | Team prefers the equally viable Vite + Express split after a technical spike |
| 004 | Public synthetic mode first | Fits the budget and allows a dependable public demonstration | A provider grants documented simulator/public-display rights |
| 005 | Global markets from the first domain/schema; enable real data by verified capability | Worldwide scope needs venue identity, currencies and local rules before rollout | Coverage inventory, vendor capability and cost evidence change |
| 006 | Framework-supported authentication library and server sessions | Removes the current browser-trusted identity flow | Managed auth reduces operational burden enough to justify dependency/cost |
| 007 | Reference-price fill model with disclosed spread | Testable, understandable, and works without pretending to have full market depth | Licensed bid/ask data and a tested alternative model are available |
| 008 | Immediate market orders only in the MVP | No unattended execution guarantee or worker bill required | Funded worker, reservations, races, expiry, and recovery are verified |
| 009 | Balanced virtual-cash journal and immutable fills | Reconciliation and explainable outcomes | Additional instruments/currencies require richer accounting |
| 010 | Vercel + small managed MySQL demo | Lowest initial deployment effort and plausible $0–5 target | Connection limits, networking, uptime, or a stream worker need a paid topology |
| 011 | Per-exchange rights and trading policies for every region | Data coverage/rights differ by venue; India's Kite restriction is one concrete example | A venue's agreement, rules or data capabilities change |
| 012 | Separate securities, exchange listings and effective-dated provider aliases | Global tickers, cross-listings and provider codes cannot share one bare-symbol identity | A verified identifier model or venue mapping requires an extension |
| 013 | Native-currency wallets plus explicit virtual FX; reporting currency is separate | Funds, quote units and valuation must remain correct across markets | A reviewed automatic-conversion policy is accepted |
| 014 | Versioned worldwide venue inventory and capability register | A global scope claim must account for uncovered and unknown exchanges | Venue universe, entitlements or supported capabilities change |

## Questions that remain open

1. Does Alpha Vantage accept this project into its educational/open-source program, and what use/datasets does that approval cover?
2. Which combination of broad and regional providers can cover the worldwide venue inventory, at what freshness/cost and with what public-simulator/retention rights? No universal free live feed is verified.
3. Does the workbench direction work with global discovery, native-currency order tickets and FX reporting? The current visual study is one fictional USD listing view; global interaction design and student walkthroughs remain work.
4. Which MySQL host/region and network controls are actually available at provisioning time? Can the chosen limits survive the planned demo burst?
5. Which supported auth/OAuth configuration and pinned framework versions pass the first vertical-slice spike?
6. Are there legacy users/data worth preserving? The proposal defaults to clean simulation accounts with a separately labeled archive/import.

Resolve these in GitHub issues and update the relevant ADR. Changes to feed semantics, model assumptions, or accounting rules require a versioned decision and associated acceptance tests.
