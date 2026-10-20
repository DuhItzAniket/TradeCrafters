# Changelog

Changes are recorded when implemented; this file does not imply a tagged or publicly deployed release.

## Unreleased

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

Orders, positions, virtual FX conversion, real-data entitlements and public deployment remain on the [roadmap](docs/ROADMAP.md). Credits: **Aniket Kumar and Annapurna S**.
