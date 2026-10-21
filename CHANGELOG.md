# Changelog

## 21 October 2026 — Hosted FX preview timing

- Decoupled FX preview arithmetic from the browser wall clock after a real hosted walkthrough rejected a fresh server quote on a clock running about two seconds slow. Review expiry now uses a monotonic clock, conservatively subtracts request latency and clears stale reviews; server execution expiry/ownership checks remain strict.
- Added clock-skew, exact-deadline, late/invalid timing, account-binding and dust regression checks. Recorded actual hosted pool recovery, GitHub callback/reload and a synthetic grant/order/position; remaining M4 acceptance stays open.

## 21 October 2026 — Serverless database pool recovery

- Enable mysql2 idle reaping, attach release events to Vercel's suspension lifecycle and impose a 60-second production session idle backstop. This addresses the actual hosted runtime retaining all 12 allowed connections while no queries were active, without raising its connection ceiling.
- Add a real-MySQL regression with a simulated Vercel request context: checked-out work survives idle cleanup, released sockets drain before suspension and the pool reconnects. Hosted browser acceptance and the remaining M4 gates stay open.

## 21 October 2026 — Hosted MySQL provisioning and verification

- Explicitly enabled MySQL hostname verification alongside certificate-chain verification. Valid hosted TLS succeeded; wrong-CA and wrong-hostname probes were rejected.
- Accepted Aiven's ANSI double-quoted grants in the strict runtime inspector, preserving exact table/column permissions and rejecting mismatched quotes and other schemas. The automated suite now has 53 domain/configuration and 75 integration checks.
- Selected Singapore Functions to match the owner's Aiven service and documented actual schema/seed, restricted identities, privilege denials and the server-enforced runtime cap: 12 connections accepted, two rejected. Hosted OAuth/browser and the remaining M4 operational gates stay open.

## 21 October 2026 — Vercel workspace build repair

- Declared pinned TypeScript and React/Node type build dependencies in the web workspace, added an explicit dev-inclusive Vercel install command and aligned the container build with filtered web installation. This fixes the hosted build stopping after compilation because root-only TypeScript dependencies were not installed. Runtime hosted configuration and M4 acceptance remain separate.

## 20 October 2026 — M4 deployment foundations

- Added bounded MySQL acquisition across promise and auth callback paths, recoverable capacity responses and hosted PEM CA configuration. Normal concurrent trade/idempotency behavior remains verified.
- Shared the explicit runtime grant contract between local provisioning and a read-only release inspector; hosted inspection requires verified TLS and a server-enforced connection budget with an operator reserve.
- Added a digest-pinned, non-root standalone Docker build, secret/legacy build-context exclusions and database-free liveness/container checks.
- Rehearsed authenticated-encryption backup/restore in a disposable MySQL server, exact all-row recovery, archived receipt retrieval, accounting reconciliation and aggregate user-cap enforcement. Added these operations to CI and documented the hosted setup/release gates.
- M3 remains open for owner-deferred student feedback. M4 remains open for actual hosting, production identity, ingress controls, execution pause and hosted recovery evidence; no public/billable resource or real feed was created.

Changes are recorded when implemented; this file does not imply a tagged or publicly deployed release.

## Unreleased

### Global workbench implementation — 20 October 2026

- Integrated venue-qualified discovery, browser watchlists, an authored training chart/table and the native order ticket; mobile discovery collapses after selection. Real reference selections expose missing coverage without invented prices or trading controls.
- Added bounded read-only chart contracts with a fixed server cutoff, exact tick/session-aware authored paths, keyboard time inspection, rule-check expiry and isolated failure/late-response handling. Chart points never choose fill prices or move the M2 account clock.
- Added account-record navigation, loaded-receipt filters, reporting FX source/completeness details, receipt focus and directory/workbench deep links. Preserved native accounting, same-key recovery and archive/reset semantics.
- Expanded verification to 44 domain/configuration and 72 HTTP/MySQL checks plus responsive, keyboard, trade/FX, stale/break/outage, decline and lost-response browser checks. Fixed an ICU-dependent hydration mismatch and kept listing selection usable during outages.
- Prepared the student walkthrough protocol. **M3 remains open for deferred real student feedback**; no observations or accessibility certification are fabricated. Real feeds and public deployment remain later work.

### Trading integrity and M2 acceptance — 20 October 2026

- Added account-bound fictional quote snapshots and native market buys/sells with a declared fixed training clock, versioned spread/tick model, lots, sessions, price bands and caps.
- Added one-connection account serialization, durable body-bound idempotency, immutable fills/receipts, balanced native journals, exact weighted basis/P&L and complete-or-unavailable reporting valuation.
- Added explicit virtual FX with separate versioned exercise rates, exact exponent/remainder handling and atomic linked currency journals. Wallet creation never adds funds.
- Added the practice desk with reviewed trade/conversion intents, native holdings/wallets, receipt pagination/provenance, same-tab reload recovery after unknown results, and explicit archive/reset history with one replacement grant.
- Added migration 0008 and restricted runtime grants; expanded verification to 38 domain/configuration and 70 HTTP/MySQL checks, including cash/inventory/FX/reset races, SQL failures, actual process death before commit and response loss after commit. Verified mobile widths, keyboard trading/table scrolling and archived-history navigation.
- Updated setup, architecture status, accounting/rollback contract and acceptance evidence. The full chart workbench is M3; real feeds and public hosting remain gated.

### Catalog integrity and M1 acceptance — 20 October 2026

- Added case-sensitive dated provider aliases, serialized overlap checks, idempotent publication, audits and a server-clock read API.
- Added immutable source snapshots, MIC definitions/hashes, parent/diff history, dated promotion, audited classification and independent provider/use capability contracts. Directory filters expose unknown coverage; all 2,889 records remain unreviewed and real simulation stays disabled.
- Added account-bound synthetic FX quote/rounding contracts; executable wallet conversion remains M2.
- Separated local web/operator database identities and removed operator/Docker credentials from the web env. Added actual privilege-denial tests, exact-origin auth configuration, sanitized logging and OAuth state/failure/recovery fixtures.
- Expanded verification to 29 domain/configuration and 51 integration checks, source-pattern CI review, responsive browser evidence and a production build. Documented M1 acceptance, owner-attested historical credential disposition and open M2–M7 gates.

### Versioned market policies — 20 October 2026

- Added immutable calendar/rule versions, effective listing assignments, dated permission gates, listing halts and transactional publication audits.
- Added half-open sessions, breaks, auctions, holidays, early closes, overnight trading dates and explicit DST ambiguity rejection, plus exact board-lot/tick/band validation.
- Added a server-clock policy read API and responsive scenario-rule panel for all ten fictional regional listings. Real-market simulation and orders remain disabled.
- Expanded verification to 16 domain and 27 HTTP/MySQL checks; documented fixture provenance and the remaining M1 gates.

### Account security — 20 October 2026

- Added authenticator enrollment, local QR rendering and single-use recovery-code sign-in.
- Added explicit operator CLI role grants/revocation and session-specific, expiring administrator verification.
- Added audited pause/resume of new simulation funding with transactional authorization and funding locks.
- Expanded HTTP/MySQL security checks, documented operator setup and verified the owner-assisted local GitHub OAuth callback.
- Added the requested TradeCrafters OAuth logo and compatible-runtime Dependabot constraints.

### Foundation — 20 October 2026

- Added the Node 24 / Next.js / TypeScript / MySQL workspace alongside the original DBMS coursework.
- Built a responsive global explorer with ten fictional listings across six regions and explicit currency/quote-unit information.
- Imported a dated 2,889-record ISO MIC reference snapshot with search, country/type filters and pagination. Classification and real-data coverage remain separate work.
- Added database sessions, request validation and ownership checks, native-currency simulation accounts and a single balanced opening grant.
- Added repeatable local setup, SQL migrations, 8 domain tests and 11 HTTP/MySQL integration checks, production compilation and GitHub Actions.
- Established protected-main checks, opt-in PR auto-merge, dependency alerts and private vulnerability reporting.
- Added current setup, architecture, audit, roadmap, screenshots, verification and contribution/security documentation.

The full chart workbench, real-data entitlements, public deployment and resting orders remain on the [roadmap](docs/ROADMAP.md). Credits: **Aniket Kumar and Annapurna S**.
