# Current-state audit

Reviewed on **20 October 2026** against GitHub commit [`8fa026527631bbfa51bcd0ba5e3412eaa8df5b16`](https://github.com/DuhItzAniket/TradeCrafters/tree/8fa026527631bbfa51bcd0ba5e3412eaa8df5b16).

## Scope and confidence

This is a source review, lockfile dependency audit, and isolated controller-logic investigation. It is not a penetration test of a running deployment. No live database, user account, market API key, or deployed endpoint was used. Findings below distinguish direct source evidence from behavior dependent on the database environment.

The local exported project is not a Git checkout. Compared with the cloned baseline, its tracked `server/.env.example` and `sql/StockMarketDB.sql` differ, and it contains an extra `server/database/db.js`. Local environment values and SQL differences were not copied into Git or published. The audit's source-of-truth is the GitHub version, which another developer must be able to reproduce.

The original idea, React component breakdown, use of parameterized SQL, bcrypt password hashing, and relational modeling are useful foundations. The schema expresses aspirations such as orders, sessions, watchlists, and roles that the mounted application does not yet implement.

Severity means priority for a publicly reachable simulator, rather than a formal CVSS score. A simulated balance still requires integrity and account privacy.

## Release-blocking findings

| ID | Priority | Evidence at baseline | Impact and required change |
| --- | --- | --- | --- |
| TC-01 | Critical | [`apiRoutes.js:7–14`](https://github.com/DuhItzAniket/TradeCrafters/blob/8fa026527631bbfa51bcd0ba5e3412eaa8df5b16/server/routes/apiRoutes.js#L7-L14), [`userController.js:83–88`](https://github.com/DuhItzAniket/TradeCrafters/blob/8fa026527631bbfa51bcd0ba5e3412eaa8df5b16/server/controllers/userController.js#L83-L88), [`App.jsx:11–27`](https://github.com/DuhItzAniket/TradeCrafters/blob/8fa026527631bbfa51bcd0ba5e3412eaa8df5b16/client/src/App.jsx#L11-L27) | Login verifies a password but returns only a username/success payload. No session or signed token is established; protected routes rely on local storage. API routes have no authentication middleware. Establish server-verified sessions and authorize every resource operation. |
| TC-02 | Critical | [`tradeController.js:5`](https://github.com/DuhItzAniket/TradeCrafters/blob/8fa026527631bbfa51bcd0ba5e3412eaa8df5b16/server/controllers/tradeController.js#L5), [portfolio/history routes](https://github.com/DuhItzAniket/TradeCrafters/blob/8fa026527631bbfa51bcd0ba5e3412eaa8df5b16/server/routes/apiRoutes.js#L7-L9) | The request supplies the account username, including for mutations. Subject to the app running and the user existing, callers can target another user's account. Derive identity from the verified session and verify ownership of each account/order. This matches the object-authorization risk described by [OWASP](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/). |
| TC-03 | Critical | [`tradeController.js:5–46`](https://github.com/DuhItzAniket/TradeCrafters/blob/8fa026527631bbfa51bcd0ba5e3412eaa8df5b16/server/controllers/tradeController.js#L5-L46) | The browser chooses the fill price. A positive-price check cannot establish a market price. Obtain an eligible server-side quote and store its provenance with the execution. A limit price is an instruction, never a client-supplied fill. |
| TC-04 | High | [`tradeController.js:56–109`](https://github.com/DuhItzAniket/TradeCrafters/blob/8fa026527631bbfa51bcd0ba5e3412eaa8df5b16/server/controllers/tradeController.js#L56-L109) | Side is not constrained to buy/sell. An unknown string skips both holding branches, then follows the balance-credit branch. Reject unknown values before transaction work. An isolated probe demonstrates the controller attempts a credit without changing holdings. |
| TC-05 | High | [transaction start and reads](https://github.com/DuhItzAniket/TradeCrafters/blob/8fa026527631bbfa51bcd0ba5e3412eaa8df5b16/server/controllers/tradeController.js#L23-L53), [writes/commit](https://github.com/DuhItzAniket/TradeCrafters/blob/8fa026527631bbfa51bcd0ba5e3412eaa8df5b16/server/controllers/tradeController.js#L106-L134), [`config/db.js`](https://github.com/DuhItzAniket/TradeCrafters/blob/8fa026527631bbfa51bcd0ba5e3412eaa8df5b16/server/config/db.js) | Balance/holding reads have no locking; retries have no idempotency key. Concurrent orders can use stale state. The controller calls `db.query` for transaction boundaries; **if** wired to the tracked pool implementation, these calls do not pin one connection. The actual imported module is absent, so its transaction behavior cannot be verified. Use one checked-out connection, account-row locking, unique constraints, and idempotency. |
| TC-06 | High | [`tradeController.js:65–66,107–109`](https://github.com/DuhItzAniket/TradeCrafters/blob/8fa026527631bbfa51bcd0ba5e3412eaa8df5b16/server/controllers/tradeController.js#L65-L66), [`TradeForm.jsx:102–105`](https://github.com/DuhItzAniket/TradeCrafters/blob/8fa026527631bbfa51bcd0ba5e3412eaa8df5b16/client/src/components/TradeForm.jsx#L102-L105) | Browser inputs remain strings. `5 + "2"` produces `"52"` rather than 7. If a DECIMAL balance is returned as a string, sell-side addition also concatenates. Probes confirm both JavaScript paths with controlled inputs; the actual driver configuration is unverified. Adopt strict input parsing and decimal arithmetic. |
| TC-07 | High / boot blocker | [controller import](https://github.com/DuhItzAniket/TradeCrafters/blob/8fa026527631bbfa51bcd0ba5e3412eaa8df5b16/server/controllers/tradeController.js#L1), [ignore rule](https://github.com/DuhItzAniket/TradeCrafters/blob/8fa026527631bbfa51bcd0ba5e3412eaa8df5b16/.gitignore#L41) | Both controllers require `../database/db`, which is absent from the Git tree. `.gitignore` ignores directories named `database`. A clean checkout cannot resolve that required module even after dependencies are installed. Track non-secret database connection code and test clean-checkout startup. |
| TC-08 | High | [`schema.sql`](https://github.com/DuhItzAniket/TradeCrafters/blob/8fa026527631bbfa51bcd0ba5e3412eaa8df5b16/sql/schema.sql), [`StockMarketDB.sql`](https://github.com/DuhItzAniket/TradeCrafters/blob/8fa026527631bbfa51bcd0ba5e3412eaa8df5b16/sql/StockMarketDB.sql) | Competing schemas use incompatible IDs, table names, columns, and transaction types. `getPortfolio` selects `last_updated`; the larger schema has `updated_at`. Registration requires columns absent from the smaller schema. Mixed `Users`/`users` casing can also fail on case-sensitive hosts. Replace with one versioned migration history and lowercase names. |
| TC-19 | High / credential exposure | Configuration inventory of the older ZIP in retained commit `661c867`; [sanitized evidence](evidence/history-configuration.json) | The archive contains non-placeholder database-password and market-data-key values. Their present validity was not tested. Treat them as exposed: rotate/revoke before reuse, examine associated provider/database activity privately, and never publish the values. Removing the ZIP from the latest tree or adding `.gitignore` does not revoke credentials or purge history. History rewriting, if desired, is a separate coordinated operation. |

The tracked `config/db.js` loads dotenv inside its module. Environment-loading order alone is therefore not established as a separate defect; the missing imported module is the confirmed boot blocker.

## Functional and operational gaps

| ID | Priority | Evidence / observation | Required behavior |
| --- | --- | --- | --- |
| TC-09 | High | [`Portfolio.jsx:11–14,34–38`](https://github.com/DuhItzAniket/TradeCrafters/blob/8fa026527631bbfa51bcd0ba5e3412eaa8df5b16/client/src/components/Portfolio.jsx#L11-L38) expects an array and `average_cost`; [API:191–194](https://github.com/DuhItzAniket/TradeCrafters/blob/8fa026527631bbfa51bcd0ba5e3412eaa8df5b16/server/controllers/tradeController.js#L191-L194) returns `{holdings,totalValue}` with `avg_price`. | One typed response schema, contract checks, visible error states, and query invalidation after fills. |
| TC-10 | High | [Chart proxy](https://github.com/DuhItzAniket/TradeCrafters/blob/8fa026527631bbfa51bcd0ba5e3412eaa8df5b16/server/controllers/tradeController.js#L243-L249) fetches `TIME_SERIES_DAILY`; [form](https://github.com/DuhItzAniket/TradeCrafters/blob/8fa026527631bbfa51bcd0ba5e3412eaa8df5b16/client/src/components/TradeForm.jsx#L26-L37) treats the last daily close as current price. | Separate bars and executable quotes. Show feed, venue coverage, source timestamp, delay, and market state. Never advertise daily closes as live execution data. |
| TC-11 | Medium | [Portfolio valuation](https://github.com/DuhItzAniket/TradeCrafters/blob/8fa026527631bbfa51bcd0ba5e3412eaa8df5b16/server/controllers/tradeController.js#L179-L189) multiplies quantity by average purchase price. | Display cost basis, marked value, cash, realized P&L, and unrealized P&L separately. Missing marks mean unavailable valuation, not zero. |
| TC-12 | High | [Proxy](https://github.com/DuhItzAniket/TradeCrafters/blob/8fa026527631bbfa51bcd0ba5e3412eaa8df5b16/server/controllers/tradeController.js#L243-L255) forwards upstream JSON without cache, explicit timeout, quota handling, or payload validation. | Shared provider budget, validated symbols, bounded timeouts, duplicate-request coalescing, quota-aware backoff, and no execution on stale data. Handle provider error JSON even with HTTP 200. |
| TC-13 | Medium | [Login URLs](https://github.com/DuhItzAniket/TradeCrafters/blob/8fa026527631bbfa51bcd0ba5e3412eaa8df5b16/client/src/components/Login.jsx#L20), trade, charts, history, and portfolio hardcode `http://localhost:5000`. | Same-origin relative API URLs, explicit environment configuration, and HTTPS deployment checks. |
| TC-14 | Medium | [`StockQuote.jsx:9`](https://github.com/DuhItzAniket/TradeCrafters/blob/8fa026527631bbfa51bcd0ba5e3412eaa8df5b16/client/src/components/StockQuote.jsx#L9) calls a quote route absent from the mounted router. `Dashboard.jsx` is not mounted in `App.jsx`. Several route/model/controller/service files are empty. | Remove dead paths; document and test only the active route inventory. An unused broken component is not evidence that every active screen fails. |
| TC-15 | High | [Trade errors](https://github.com/DuhItzAniket/TradeCrafters/blob/8fa026527631bbfa51bcd0ba5e3412eaa8df5b16/server/controllers/tradeController.js#L158-L164) return `sqlState` and `sqlMessage`; server uses unrestricted CORS. No app-level rate limits or role checks appear in the mounted path. | Stable public error codes, private sanitized logs, origin/CSRF controls for cookie sessions, persistent rate limits, and server-side admin authorization. CORS is not an authorization control. |
| TC-16 | Medium | [History polling](https://github.com/DuhItzAniket/TradeCrafters/blob/8fa026527631bbfa51bcd0ba5e3412eaa8df5b16/client/src/components/TransactionHistory.jsx#L22) runs every five seconds; portfolio fetches only when username changes. | Refresh dependent state after fills, pause background polling, paginate history, and reconcile ambiguous submissions by idempotency key. |
| TC-17 | High for migrations | [`StockMarketDB.sql:2`](https://github.com/DuhItzAniket/TradeCrafters/blob/8fa026527631bbfa51bcd0ba5e3412eaa8df5b16/sql/StockMarketDB.sql#L2) drops the database; [`fix_transactions.sql:4`](https://github.com/DuhItzAniket/TradeCrafters/blob/8fa026527631bbfa51bcd0ba5e3412eaa8df5b16/sql/fix_transactions.sql#L4) drops transaction history. | Separate disposable development reset from forward migrations; backup and restore rehearsal before any import. These scripts were not executed in this review. |
| TC-18 | Medium | README claims JWT authentication; server dependencies/route flow do not implement it. No tracked CI workflows or substantive tests were found. `react-scripts` supplies the client build. | Correct feature claims, add clean-checkout CI, auth/concurrency tests, and a supported build stack. React officially [deprecated Create React App for new apps](https://react.dev/blog/2025/02/14/sunsetting-create-react-app). |

An admin role exists in SQL, but a working administrator UI/API is not evidenced by the active code. Treat it as new work; do not assume that the remembered course implementation is present in GitHub.

## Dependency snapshot

Commands executed independently in `server/` and `client/`:

```text
npm audit --package-lock-only --ignore-scripts --json
```

| Lockfile | Low | Moderate | High | Critical | Total affected packages |
| --- | ---: | ---: | ---: | ---: | ---: |
| Server | 0 | 3 | 7 | 3 | 13 |
| Client | 6 | 15 | 83 | 4 | 108 |

The npm registry response on the research date flags direct dependencies including server `axios`, `express`, `mysql2`, and client `axios`, `react-router-dom`, `react-scripts`. Transitive package severities propagate through the dependency graph. Some findings affect install/build tooling or require call patterns absent from this app. **No exploitability claim or automated breaking upgrade is implied.**

The [machine-readable summary](evidence/dependency-audit.json) includes lockfile hashes, package severities, and advisory references. Audit totals will change as the registry changes. Re-run on the implementation branch and triage runtime reachability separately from build/install risk; do not use `npm audit fix --force` blindly.

## Reproducible, isolated evidence

Run from the repository root with Node.js:

```text
node docs/research/evidence/verify-legacy.cjs
```

The harness reads the original controller, injects a fake database, and makes no network/database connections. It checks module resolution and three narrow logic paths: invalid side, string quantity, and string balance. [Captured results](evidence/legacy-probe-results.json) document the baseline behavior. These are controlled logic probes, not a successful end-to-end trade or proof of every possible deployment outcome.

Parameterized SQL already reduces SQL-injection risk in the reviewed queries. No confirmed SQL injection or plaintext **user-account** password storage is asserted here. The current tree contains an environment template and ignores `.env`, but the older uploaded ZIP was inspected in memory and contains non-placeholder configuration secrets (TC-19). Values were omitted from all published evidence and were not tested against any service. A comprehensive secret scan covering all file formats/history, rotation of exposed credentials, and a private activity review remain release gates.

## Immediate disposition

Keep the baseline as coursework evidence. If a legacy deployment exists, make it private or disable mutations until authentication, ownership, and trusted pricing are implemented. Start the new app in an additive directory and replace the legacy runtime only after a tested vertical slice works. No legacy application code was changed during this research phase.
