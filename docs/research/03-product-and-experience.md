# Product and experience brief

## Positioning

**Practice a decision. Understand its execution. Review the result.** TradeCrafters should be a focused learning simulator for students and early traders. Its strongest portfolio story is the integrity of its trading model, thoughtful interaction design, and clear engineering evidence.

Original creators: **Aniket Kumar and Annapurna S**. Preserve that credit in the repository, About page, and any case study. The redesign builds on their DBMS coursework.

The owner confirmed US first, India eventually, and a near-free budget. That makes a coherent, limited product more useful than a sprawling terminal full of unsupported features.

## Research lessons

| Reference | Documented capability | Design inference for this project |
| --- | --- | --- |
| [TradingView paper trading](https://www.tradingview.com/support/solutions/43000516466-paper-trading-main-functionality/) | Charting, order tickets, positions/orders, and market/limit/stop interactions | Keep analysis and order intent close together. Adopt the workflow hierarchy, without copying the interface or promising its feature breadth. |
| [IBKR paper-account limitations](https://www.interactivebrokers.com/campus/glossary-terms/paper-trading-account/) | Explicit differences between simulation and execution, including top-of-book assumptions | A useful simulator can explain its limits. A clear receipt is more credible than a fabricated depth-of-market panel. |
| Current TradeCrafters source | Chart, form, portfolio, and history exist as separate components, with disconnected contracts and teaching-placeholder copy | Build a continuous task flow, unify data contracts, and make state updates dependable. |

These are a small desk-research benchmark and design interpretation, not usability testing. Validate the concept with 3–5 students before treating the layout as settled: ask them to identify data mode, place a small trade, explain the fill price, and find their remaining cash without coaching.

## Core journeys

1. **Explore:** view a clearly labeled fictional practice market, inspect a company/instrument, read the model explanation, then create an account through a supported auth flow.
2. **First trade:** receive the $10,000 virtual grant, choose an instrument, enter whole shares, inspect the estimate and modeled costs, review, submit once, and receive a persistent order receipt.
3. **Understand:** open positions to see cash, basis, marks, equity and P&L with their timestamps. Follow a fill to see why its price differs from the reference quote.
4. **Review:** filter activity; optionally attach a personal journal note in a later milestone. Reset by archiving a practice account and opening another, preserving the old result.
5. **Operate:** an authorized admin can pause trading, suspend an abusive account, and manage enabled instruments. Every action has a reason and audit event.

## Feature prioritization

| First public release | After correctness and user feedback | Defer until justified |
| --- | --- | --- |
| Synthetic workbench, account creation, cash grant, market orders, positions, receipts, reset/archive, source/mode labels, accessible responsive UI, admin pause | Entitled real US data, watchlist editing, corporate actions for multi-day accounts, journal, comparison to a same-mode benchmark, reviewed CSV export | Resting limit/stop orders, challenges/leaderboards, India, advanced indicators, drawing tools, fractional shares, advanced order types |

No AI stock picker, social feed, fake bid/ask depth, or real-money integration is required. Learning guidance should explain terms and outcomes using deterministic product copy first.

## Visual direction: a calm trading workbench

The [standalone design study](../design/workbench.html) is an inspectable layout and interaction reference. It uses fictional instruments and fixed illustrative values, has no backend, sends no trades, and persists no account data. Its review action only previews the order summary. This distinction is visible in the interface.

**Composition:** a slim top bar; compact left navigation/watchlist; broad center chart; right order ticket; positions/activity along the lower edge. Strong alignment, thin separators, and varied density create hierarchy. Avoid wrapping every label in another rounded card.

**Typography:** a neutral sans-serif stack for navigation and prose, tabular numerals for all quantities/prices, and a restrained serif accent on the public editorial landing page only if it improves the identity. Align numbers to the right and keep their decimal precision consistent. No emoji brand mark.

**Palette:** graphite canvas, slightly raised panels, off-white primary text, subdued secondary text, warm amber for focus and the primary action. Green/red carry positive/negative meaning together with signs and words. A light theme uses the same hierarchy rather than merely inverting colors. The design study specifies tokens in CSS.

**Shape and motion:** mostly 4–8px corner radii, 1px dividers, 4px spacing increments; brief state transitions with reduced-motion support. No glass blur, decorative gradients, floating blobs, confetti, or constant flashing prices.

**Chart:** give price movement the most space. Include symbol/company, currency, timeframe, source, source time, mode, and session status. Offer chart/table alternatives and readable axes. Pan/zoom are secondary to finding the current instrument and placing a correct order. The chosen chart library supplies rendering, not prices or market permission.

## Screen specification

| Surface | Essential content | Interaction acceptance |
| --- | --- | --- |
| Public introduction | Product purpose, credible workbench preview, synthetic/data-mode explanation, creators, explore/sign-in actions | No unsupported live-price claims, invented user counts, or fake testimonials |
| Workbench | Watchlist, selected instrument, chart, order ticket, cash, positions, recent activity | Changing symbol updates chart/ticket consistently; a response from an earlier search cannot overwrite the current selection |
| Order review | Side, symbol, quantity, indicative reference/fill estimate, modeled spread, fee, estimated total, mode and quote time | Review does not reserve a price. Submission uses a fresh server snapshot. Exact final values appear only in the receipt |
| Portfolio | Cash, marked holdings, equity, P&L, allocation, basis, data completeness | Cost basis is distinct from market value; stale marks remain visibly stale |
| Activity/receipt | Structured order side, fill time/price, status/rejection reason, source snapshot, model version, fee | History is paginated and durable; failed/unknown outcomes have a recovery action |
| Account/settings | Profile, sessions, currency/mode, archive/reset, privacy/retention controls | Reset requires confirmation, explains the new grant, and does not rewrite prior fills |
| Admin | Pause state, user suspension, instrument allowlist, feed health/quota, audit trail | Server permission on every action; role changes cannot be made through ordinary profile fields |

## State and accessibility requirements

| State | User-facing behavior |
| --- | --- |
| Loading | Stable skeleton with fixed chart/table dimensions; no temporary zero cash/price |
| No positions | Explain the virtual balance and how to place the first trade |
| Closed session | Show the next session in exchange and local time; disable immediate real-market execution |
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
