# Product and experience brief

## Positioning

**Practice a decision. Understand its execution. Review the result.** TradeCrafters should be a focused learning simulator for students and early traders. Its strongest portfolio story is the integrity of its trading model, thoughtful interaction design, and clear engineering evidence.

Original creators: **Aniket Kumar and Annapurna S**. Preserve that credit in the repository, About page, and any case study. The redesign builds on their DBMS coursework.

The owner clarified **all stock exchanges globally**, with a near-free prototype budget. Global exchange discovery, listing identity, local market rules, native currencies and FX belong in the core experience. Readiness-based data releases must not silently turn the product into a US-only app.

## Research lessons

| Reference | Documented capability | Design inference for this project |
| --- | --- | --- |
| [TradingView paper trading](https://www.tradingview.com/support/solutions/43000516466-paper-trading-main-functionality/) | Charting, order tickets, positions/orders, and market/limit/stop interactions | Keep analysis and order intent close together. Adopt the workflow hierarchy, without copying the interface or promising its feature breadth. |
| [IBKR paper-account limitations](https://www.interactivebrokers.com/campus/glossary-terms/paper-trading-account/) | Explicit differences between simulation and execution, including top-of-book assumptions | A useful simulator can explain its limits. A clear receipt is more credible than a fabricated depth-of-market panel. |
| Current TradeCrafters source | Chart, form, portfolio, and history exist as separate components, with disconnected contracts and teaching-placeholder copy | Build a continuous task flow, unify data contracts, and make state updates dependable. |

These are a small desk-research benchmark and design interpretation, not usability testing. Validate the concept with 3–5 students before treating the layout as settled: ask them to identify data mode, place a small trade, explain the fill price, and find their remaining cash without coaching.

## Core journeys

1. **Explore:** browse the global exchange directory by region, country, MIC, currency and actual data capability. Disambiguate listings by venue. Clearly labeled fictional regional scenarios support the prototype; unavailable real data remains visible as a gap.
2. **First trade:** receive the $10,000 virtual grant, choose an instrument, enter whole shares, inspect the estimate and modeled costs, review, submit once, and receive a persistent order receipt.
3. **Understand:** distinguish native wallet cash and listing basis/P&L from reporting-currency totals. Convert virtual currency explicitly when needed; show FX source/time and incomplete aggregation. Follow a receipt to its venue-local session, price/quote units and model.
4. **Review:** filter activity; optionally attach a personal journal note in a later milestone. Reset by archiving a practice account and opening another, preserving the old result.
5. **Operate:** an authorized admin can pause trading, suspend an abusive account, and manage enabled instruments. Every action has a reason and audit event.

## Feature prioritization

| First public release | After correctness and user feedback | Defer until justified |
| --- | --- | --- |
| Global discovery/capability contracts, synthetic regional scenarios, native wallets/explicit FX, account creation/grant, market orders, positions/receipts, reset/archive, accessible UI, admin pause | Verified real-data capabilities across regions and ongoing worldwide gap closure; corporate actions, journal, comparable benchmarks, reviewed export | Resting/advanced order types, competitions, advanced indicators/drawing and fractional shares; global market identity/currency support is not deferred |

No AI stock picker, social feed, fake bid/ask depth, or real-money integration is required. Learning guidance should explain terms and outcomes using deterministic product copy first.

## Visual direction: a calm trading workbench

The [standalone design study](../design/workbench.html) is an inspectable layout and interaction reference. It uses fictional instruments and fixed illustrative values, has no backend, sends no trades, and persists no account data. Its review action only previews the order summary. This distinction is visible in the interface.

The current study shows a **single fictional USD listing view**. It does not yet demonstrate global exchange discovery, multiple wallets or FX. M3 must expand those interactions; the existing screenshots/browser checks must not be cited as validation of the global experience.

**Composition:** a slim top bar; compact left navigation/watchlist; broad center chart; right order ticket; positions/activity along the lower edge. Strong alignment, thin separators, and varied density create hierarchy. Avoid wrapping every label in another rounded card.

**Typography:** a neutral sans-serif stack for navigation and prose, tabular numerals for all quantities/prices, and a restrained serif accent on the public editorial landing page only if it improves the identity. Align numbers to the right and keep their decimal precision consistent. No emoji brand mark.

**Palette:** graphite canvas, slightly raised panels, off-white primary text, subdued secondary text, warm amber for focus and the primary action. Green/red carry positive/negative meaning together with signs and words. A light theme uses the same hierarchy rather than merely inverting colors. The design study specifies tokens in CSS.

**Shape and motion:** mostly 4–8px corner radii, 1px dividers, 4px spacing increments; brief state transitions with reduced-motion support. No glass blur, decorative gradients, floating blobs, confetti, or constant flashing prices.

**Chart:** give price movement the most space. Include symbol/company, currency, timeframe, source, source time, mode, and session status. Offer chart/table alternatives and readable axes. Pan/zoom are secondary to finding the current instrument and placing a correct order. The chosen chart library supplies rendering, not prices or market permission.

## Screen specification

| Surface | Essential content | Interaction acceptance |
| --- | --- | --- |
| Public introduction | Product purpose, credible workbench preview, synthetic/data-mode explanation, creators, explore/sign-in actions | No unsupported live-price claims, invented user counts, or fake testimonials |
| Global explorer and workbench | Venue/region/currency filters, capability states, venue-qualified listing search, watchlist/chart, native ticket and wallet, activity | Distinguish same-symbol listings; expose missing/historical/delayed/live support; changing listing updates all context without stale-response overwrites |
| Order review | Side, symbol, quantity, indicative reference/fill estimate, modeled spread, fee, estimated total, mode and quote time | Review does not reserve a price. Submission uses a fresh server snapshot. Exact final values appear only in the receipt |
| Portfolio and FX | Native wallets/basis/P&L, explicit conversion review, reporting equity, asset/FX effects, mark/FX timestamps | No implicit conversion or spendable-cash confusion; stale/missing FX makes totals incomplete rather than falsely precise |
| Activity/receipt | Structured order side, fill time/price, status/rejection reason, source snapshot, model version, fee | History is paginated and durable; failed/unknown outcomes have a recovery action |
| Account/settings | Profile, sessions, currency/mode, archive/reset, privacy/retention controls | Reset requires confirmation, explains the new grant, and does not rewrite prior fills |
| Admin | Pause state, user suspension, instrument allowlist, feed health/quota, audit trail | Server permission on every action; role changes cannot be made through ordinary profile fields |

## State and accessibility requirements

| State | User-facing behavior |
| --- | --- |
| Loading | Stable skeleton with fixed chart/table dimensions; no temporary zero cash/price |
| No positions | Explain the virtual balance and how to place the first trade |
| Closed session / local break | Show the venue's next eligible session and exchange/user times; disable only the affected execution path |
| Stale/unavailable | Keep context visible, label source age, disable trading, offer refresh/retry |
| Submitting | Lock duplicate submit, preserve entered values, announce progress accessibly |
| Timeout after submit | Say outcome is being checked; reconcile by the original idempotency key |
| Rejected | Specific actionable reason, entered values preserved, no fake success toast |
| Filled | Persistent receipt plus immediate cash/position/activity refresh |

Desktop at roughly 1280px and above uses three columns. Tablet collapses the watchlist into a drawer and places the ticket beside/below the chart depending on width. Mobile uses a single column, full-width chart and positions, with an explicit ticket section; a later sheet requires focus trapping and must not obscure price freshness. Do not squeeze a desktop terminal into a horizontal page scroll.

Target WCAG 2.2 AA: visible keyboard focus, properly named inputs, 44px comfortable touch controls, sufficient contrast, semantic tables with headers, non-color status cues, reduced motion, and announcements that do not read every price tick. Keyboard shortcuts must be discoverable and must never submit an order without deliberate confirmation. [WCAG reference](https://www.w3.org/TR/WCAG22/).

## Proposed success checks

- In student walkthroughs, at least 4 of 5 participants identify that the public data is synthetic and explain virtual cash versus equity.
- Participants complete the first trade and find its receipt without assistance; capture time and errors before setting a target.
- Every tested retry/concurrency scenario preserves cash and inventory invariants; no unauthorized account access succeeds.
- Set initial performance budgets of LCP under 2.5s and INP under 200ms on a representative mobile device, then measure them. These are targets, not current results.
- Track aggregate failed-order reasons, stale-quote frequency, and request budget consumption. Avoid recording personal trade notes, credentials, or raw PII in analytics.
