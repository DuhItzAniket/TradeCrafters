# Proposed decisions

All ADRs below are **proposed**, pending review. The owner's confirmed constraints are US-first, India later, and free/near-free cost. Architecture choices do not imply permission to buy a service or publish market data.

| ADR | Proposed choice | Why | Revisit when |
| --- | --- | --- | --- |
| 001 | Modular monolith with separate domain modules | One small team can reason about transactions and deploy one app | A measured scaling/ownership boundary makes extraction useful |
| 002 | Keep MySQL/InnoDB | Preserves the course project's relational foundation; supports required integrity | Hosting constraints or a concrete database feature justify a dialect migration |
| 003 | Next.js + TypeScript for the new app | Same-origin UI/API, contracts, Vercel path, container option | Team prefers the equally viable Vite + Express split after a technical spike |
| 004 | Public synthetic mode first | Fits the budget and allows a dependable public demonstration | A provider grants documented simulator/public-display rights |
| 005 | US real data as a separately gated mode | Existing symbols/currency are US-focused; limited universe reduces complexity | Data entitlements and session/corporate-action handling are ready |
| 006 | Framework-supported authentication library and server sessions | Removes the current browser-trusted identity flow | Managed auth reduces operational burden enough to justify dependency/cost |
| 007 | Reference-price fill model with disclosed spread | Testable, understandable, and works without pretending to have full market depth | Licensed bid/ask data and a tested alternative model are available |
| 008 | Immediate market orders only in the MVP | No unattended execution guarantee or worker bill required | Funded worker, reservations, races, expiry, and recovery are verified |
| 009 | Balanced virtual-cash journal and immutable fills | Reconciliation and explainable outcomes | Additional instruments/currencies require richer accounting |
| 010 | Vercel + small managed MySQL demo | Lowest initial deployment effort and plausible $0–5 target | Connection limits, networking, uptime, or a stream worker need a paid topology |
| 011 | India requires its own data approval and simulation policy | Kite prohibits this use; NSE/BSE identity/calendar/fees differ | A compatible written data agreement and implementation budget exist |

## Questions that remain open

1. Does Alpha Vantage accept this project into its educational/open-source program, and what use/datasets does that approval cover?
2. Will any provider explicitly permit a public non-commercial simulator within the budget, including price retention in receipts?
3. Does the owner prefer the workbench design study after trying it on desktop/mobile? Student walkthroughs have not yet occurred.
4. Which MySQL host/region and network controls are actually available at provisioning time? Can the chosen limits survive the planned demo burst?
5. Which supported auth/OAuth configuration and pinned framework versions pass the first vertical-slice spike?
6. Are there legacy users/data worth preserving? The proposal defaults to clean simulation accounts with a separately labeled archive/import.

Resolve these in GitHub issues and update the relevant ADR. Changes to feed semantics, model assumptions, or accounting rules require a versioned decision and associated acceptance tests.
