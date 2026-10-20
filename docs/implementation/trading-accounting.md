# M2 trading and accounting

Implemented 20 October 2026 for [issue #4](https://github.com/DuhItzAniket/TradeCrafters/issues/4). The authenticated practice desk at `/trading` connects server-owned fictional quotes to native-currency fills, cash journals, positions, explicit FX and durable receipts. See the [acceptance evidence](m2-acceptance.md) and [local setup](local-development.md).

The worldwide product scope remains unchanged. This implementation executes only the ten project-authored listings across six regions. The 2,889-record MIC reference is a discovery directory; no real exchange/feed is enabled by this milestone.

## Training clock and execution model

Accounts are bound to `regional-training-2026-10-20-v1` and `reference-spread-v1`. Each listing uses **20 October 2026 at 10:15 in its own IANA timezone**, resolved to UTC with Temporal. This is an authored exercise clock, not simultaneous live markets, a historical replay or wall-clock trading. The separate explorer policy preview checks the current wall clock and can therefore show a different session state.

Policy assignments, holidays, continuous sessions, halts, lots, ticks and fixed price bands are checked at the exercise instant. Current permission/evidence validity is checked against the actual server clock. Seeded fictional permissions expire on 1 January 2027; the system fails closed thereafter until a reviewed scenario update. Client requests cannot choose a clock, reference price, model, policy or FX rate.

| Rule                | Implemented behavior                                                                                                                                 |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prices              | Fixed fictional reference; buy adds 5 basis points, sell subtracts 5 basis points                                                                    |
| Tick quantization   | Buy rounds upward and sell downward to the applicable tick, including ladder transitions; the result must stay within the policy band                |
| Quantity            | Whole-share lot multiples, bounded by the listing policy and 1,000,000 shares per request                                                            |
| Order cap           | 100,000 virtual USD equivalent in native currency using the exercise FX table                                                                        |
| Cash                | Exact bigint arithmetic; quote-unit multiplier applied before rounding to the currency exponent; half-even rounding of the whole order               |
| Fees and settlement | Zero commission; immediate virtual cash/inventory settlement; no exchange matching or order book                                                     |
| Inventory           | Cash-only, no shorting; position cap 1,000,000,000,000 shares                                                                                        |
| Freshness           | Account-bound trade quotes valid for at most 30 seconds of actual server time; future/expired quotes are rejected, including after waiting for locks |

One accepted order creates one order, fill and two-entry native-currency journal. All money/quantity values returned by financial calculations are decimal strings; bounded request quantity is an integer. No floating-point monetary arithmetic is used. Prices and detailed provenance are immutable JSON definitions; monetary columns use exact `DECIMAL(30,0)` minor units.

## Transaction and recovery contract

Every mutation checks the live session, exact origin, strict body, ownership and persistent per-user mutation budget. `accountId` selects an owned account; it never establishes identity. Production still requires a verified provider identity. The local throwaway-password mode remains blocked in production.

Order, FX and reset submissions require a **case-sensitive `Idempotency-Key` of 16–96 letters, digits, underscores or hyphens**. The account/key pair is unique across all three operation types. Canonical JSON hashing includes the kind and validated intent.

The service checks out one MySQL connection, starts a transaction, locks the user and account, then rechecks the session after the account wait. Reset additionally locks funding control first and takes an exclusive user lock. The account lock serializes first positions/wallets, buys, sells, FX and reset. Nested policy, wallet and position reads use that same connection; no provider request or second pool checkout occurs inside the transaction.

An existing matching key returns the original receipt and HTTP status before checking current quote eligibility. A changed body/kind conflicts with 409. Business operations run behind a savepoint: a domain rejection rolls back their writes and saves a rejected receipt; an unexpected SQL/system failure rolls back the entire transaction without recording a false outcome. Deadlocks/lock timeouts retry at most twice with the same key; persistent contention returns `ACCOUNT_BUSY`/503. The lock-wait timeout is five seconds per attempt.

Receipts, successful orders/fills, quote snapshots, FX conversions and journals are append-only for the web identity. The SQL transaction commits the receipt and accounting together. Idempotency records and their referenced evidence are retained for the account's lifetime, including archived accounts. There is no expiry job that makes an old key reusable. Storage growth and retention policy require operational review before public deployment.

The browser saves the validated intent and key in an owner-scoped, versioned **sessionStorage** record before sending a financial request. An unknown result blocks new operations. **Recover saved receipt** performs an owned lookup; **Retry original request** resends the identical body and key. Reloading the same tab retains recovery state. Closing the tab, clearing site data or changing browsers can lose this local pending record; persisted server receipts remain in account activity. A confirmed receipt followed by a failed balance refresh also blocks trading until refresh succeeds. This is not an offline queue or a cross-tab submission lock.

## Native accounting and cost basis

Each wallet equals the sum of its `wallet` journal entries. Every journal has two opposite entries in **one currency**. Trade cash offsets `clearing`; explicit FX uses two linked journals, each offset by its own `fx_clearing` entry. Adding GBP and JPY entries together is never treated as reconciliation. Wallet/position amounts are bounded and nonnegative; sold inventory cannot exceed owned shares.

Buy cost increases total native cost basis by the native notional. A partial sale allocates total basis proportionally with half-even rounding. Final liquidation consumes all residual basis exactly. Realized P&L is native sale proceeds minus allocated basis; unrealized P&L is native reference mark value minus remaining basis. Closed rows retain zero quantity/basis and their realized result.

Portfolio reads hold a shared account lock on a single transaction so cash, positions and version form a consistent view. Reporting equity converts native wallet-plus-position equity with fixed exercise rates; net P&L compares that equity with the actual recorded grant. A missing required position mark makes the affected valuation and total equity/P&L **null with `complete: false`**, while native cash remains visible. The UI says “Unavailable”; it never substitutes a complete zero valuation. Each fill retains its reporting FX rate/source/time. Rates do not vary, so market FX gains and asset-versus-FX attribution are not modeled. There is no historical performance curve.

## Synthetic FX

`training-fx-v1` is a separately versioned project-authored exercise table. It is not sourced from an FX provider and does not import opening-grant constants. Its values currently share the original grant's numerical anchors; this is a scenario choice, not a relationship that future quote issuance may assume.

| Currency | Currency units per virtual USD |
| -------- | ------------------------------ |
| USD      | 1                              |
| EUR      | 9/10                           |
| GBP      | 8/10                           |
| INR      | 83                             |
| JPY      | 150                            |
| HKD      | 78/10                          |
| AUD      | 15/10                          |
| CAD      | 14/10                          |
| ZAR      | 18                             |
| BRL      | 5                              |
| SAR      | 375/100                        |
| KWD      | 3/10                           |

A quote names the owned account, two currencies, exact rational rate, source/evidence and observation/expiry instants. Issuance uses a **60-second** validity period, within the foundation contract's five-minute maximum. Conversion applies each currency's exponent independently, floors target minor units and records the exact fractional remainder. Dust, overflow, wrong account, changed provenance/rate and expiry fail closed. Source debit, target credit, both journals, conversion and receipt commit together. The target wallet may be created at zero before receiving the conversion; this never creates another grant. Reporting conversion uses half-even rounding and cannot spend another wallet's cash.

## Reset and history

Reset requires the owned active account, literal `confirmation: "RESET"` and a retained idempotency key. It archives the old account without selling/deleting positions or rewriting receipts, then creates one active account in the same reporting currency/scenario/model with one new opening grant. SQL uniqueness permits only one active account per owner. History links expose previous/next accounts; archived controls cannot submit new financial operations, but original-key replays and receipt lookups remain available.

Reset is limited to once per hour per owner and respects the administrator's pause on **new funding**. Existing funded trading and FX are not paused by that funding control. Reset/order races serialize to explicit outcomes; a retry never grants a second replacement account. Archived assets are historical exercise state and are excluded from the new account's equity.

## Same-origin API

All routes use the Node runtime and `Cache-Control: no-store`. Bodies reject unknown fields; read queries reject repeated/unknown parameters. Mutations share the existing 20-per-minute per-user budget. Quote issuance also consumes that budget; public ingress/read-abuse limits remain an M4 deployment gate.

| Method/path                   | Validated input                                                                                    | Result                                                                                  |
| ----------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `POST /api/trading/quotes`    | `accountId`, `listingId`                                                                           | Persisted quote, rules and board-lot buy/sell previews                                  |
| `POST /api/trading/orders`    | `accountId`, `listingId`, `quoteId`, `side`, `orderType: "MARKET"`, integer `quantity`; key header | Durable filled/rejected receipt                                                         |
| `POST /api/trading/fx-quotes` | `accountId`, `fromCurrency`, `toCurrency`                                                          | Persisted account-bound exercise FX quote                                               |
| `POST /api/trading/fx`        | `accountId`, `quoteId`, positive string `sourceMinor`; key header                                  | Durable converted/rejected receipt                                                      |
| `POST /api/trading/reset`     | `accountId`, `confirmation: "RESET"`; key header                                                   | Durable reset/rejected receipt                                                          |
| `GET /api/trading/operations` | Query `accountId`, `key`                                                                           | Original owned receipt or 404                                                           |
| `GET /api/trading/activity`   | Query `accountId`, optional receipt-ID `before`                                                    | 20 receipts and an optional next cursor; stable `(created_at, id)` ordering             |
| `GET /api/trading/portfolio`  | Query `accountId`                                                                                  | Consistent native balances/positions, reporting completeness, version and history links |

Successful mutations return 201 and `{ receipt }`; original retries retain that status. Saved business declines return their original 4xx/503 with both `{ receipt, error: { code, message } }`. Authentication/validation/ownership/rate-limit failures and system failures can return `{ error }` without a receipt. **A non-2xx or lost response alone is not proof that a financial request did not commit**: retain the key and look it up/retry. Representative declines include `INSUFFICIENT_FUNDS`, `INSUFFICIENT_SHARES`, `QUOTE_STALE`, `FX_QUOTE_INVALID`, `ACCOUNT_ARCHIVED`, `RESET_RATE_LIMITED` and `IDEMPOTENCY_CONFLICT`. Raw SQL, credentials and request bodies are not returned or logged.

## Upgrade and rollback

Migration `0008_trading_accounting.sql` extends accounts/journals and adds snapshots, operations, orders, fills, positions, conversions and reset links. Existing account IDs, wallets, grant snapshots and authentication state are preserved. Never edit an applied migration. Apply migration/seed with the operator identity, then rerun `npm run setup:db-identities` locally before serving the new code.

The runtime can update only `state`/`version` on account metadata; immutable accounting/evidence tables permit read/insert. Positions and wallet projections permit their required updates. Actual privilege-denial tests cover grant/reporting/owner changes and immutable receipt/quote/fill/conversion changes. Hosted identities must be provisioned and verified independently in M4.

There is no automatic down migration. M1 code assumes one account per user and is **not a safe rollback after archived-account history exists**. Stop writes before recovery, preserve a backup, and use a compatible forward repair or restore an independently verified pre-upgrade database together with its matching app. Do not drop M2 tables or delete account history to make old code start. Hosted backup/restore drills and deployment rollback verification remain M4.

The later [M3 workbench implementation](workbench.md) adds the integrated discovery/chart experience while retaining this financial contract. [M3/#5](https://github.com/DuhItzAniket/TradeCrafters/issues/5) remains open for deferred real student walkthroughs. Real provider feeds/rights, corporate actions and worldwide rule coverage remain M5/#9/M7; resting orders require M6 workers.
