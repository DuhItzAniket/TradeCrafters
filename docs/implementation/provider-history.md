# M5: private historical-data boundary

Implementation record, **24 October 2026**. Tracks [M5 #7](https://github.com/DuhItzAniket/TradeCrafters/issues/7) and [worldwide inventory #9](https://github.com/DuhItzAniket/TradeCrafters/issues/9). M3 student feedback remains separate and open. M4 deployment acceptance remains unchanged.

## Available now

Two operator-only adapters retrieve bounded daily history: Twelve Data `/time_series` and EODHD `/api/eod/{symbol.exchange}`. They normalize exact decimal strings, local trading dates, provider identity and adjustment provenance. This is an implementation and simulated-contract milestone, **not acceptance of real provider data**. There is no provider account/key configured, no live request has passed, and no real exchange gains coverage from these fixtures.

No web route, browser subscription, background worker, database migration or ledger connection is added. The hosted experience stays explicitly synthetic. A standalone operator invocation makes at most one provider request, with no redirects or automatic retry, a five-second default timeout (ten-second ceiling), a 256 KiB decoded response cap and at most 31 calendar days/31 returned bars. Repeating invocations still consumes quota; this command is not a shared quota scheduler.

## Provider contracts and research

| Provider | Request and representation | Important boundary |
| --- | --- | --- |
| Twelve Data | `GET /time_series`; one symbol, MIC and exchange; `interval=1day`, `start_date`, `end_date`, `order=asc`, `outputsize=31`, `adjust=none`, `dp=11`, `format=JSON` | Exact OHLCV strings; echoed symbol/MIC/exchange/currency/timezone/type must match the reviewed plan. Daily dates are exchange-local dates. `/eod` is a separate closing-price endpoint. |
| EODHD | `GET /api/eod/{symbol.exchange}`; `from`, `to`, `period=d`, `order=a`, `fmt=csv` | CSV retains source decimal text. Raw OHLC remains distinct from split/dividend-adjusted close; volume is split adjusted. No identity metadata is echoed; the result records mapping-only identity. `.US` is a composite namespace, not proof of a particular MIC. |

Contract sources: [Twelve Data official SDK documentation](https://github.com/twelvedata/twelvedata-java/blob/main/docs/MarketDataApi.md), [EODHD historical API](https://eodhd.com/financial-apis/api-for-historical-data-and-volumes). Reviewed 24 October 2026. Currency/venue fixtures are project-authored test cases, not provider claims about subscriptions or supported aliases.

Orbit search/integrate discovered Twelve Data EOD and EODHD historical candidates, but its integration brief did not supply a complete, consistent OHLC-series contract. The implementation uses the primary documentation above rather than treating the discovered EOD response shape as authoritative. No owner mock was pulled because the Postman CLI is unauthenticated; the checked-in mocks were authored from these documented contracts. No workspace was created and no mock was published.

Twelve Data distinguishes personal/internal development from external display and redistribution; non-US commercial usage and ASX have additional requirements. A subscription directory can show exchanges outside the account's price entitlements. [Usage policy](https://support.twelvedata.com/en/articles/5332349-commercial-and-personal-usage). EODHD also distinguishes personal and commercial licensing. [License guidance](https://eodhd.com/financial-apis/commercial-vs-personal-license-use). Neither a free key nor an educational account establishes public simulator, retention or replay rights. Confirm the actual account agreement before approving access.

## Fail-closed identity and data rules

- A strict plan names a listing, provider alias, MIC, exchange namespace, provider currency, quote/settlement currencies, unit denominator, IANA timezone and mapping-evidence reference. It cannot request multiple symbols or arbitrary URLs.
- The separate private access record must approve that provider/listing for private research, have a dated evidence reference and be current at both request start and completion. `unknown`, expired or mismatched approval prevents the request. These are trusted operator records, not signed vendor attestations; supporting terms must actually be reviewed.
- All requested days must precede today's date in the exchange timezone. This prevents partial daily bars; it does not validate exchange holidays, listing lifetimes or complete expected sessions. Gaps are retained rather than filled with invented prices.
- Only same-currency units and explicitly mapped GBX/GBP hundredths are accepted in this first slice. Other minor units, ADRs, ETFs, special security types, slash/batch aliases and unsupported decimal/volume shapes remain rejected pending evidence and tests. No implicit FX conversion occurs.
- Nonpositive/impossible OHLC, duplicate or unordered dates, out-of-range bars, numeric JSON prices and incorrect provider metadata fail. Unadjusted close and EODHD adjusted close remain separate fields. Splits, dividends and cash-ledger actions are not implemented by these adapters.
- Normalized history always carries `purpose=private_research`, `executionEligible=false` and `publicDisplayAuthorized=false`. It cannot promote catalog permissions or count as verified venue coverage.
- HTTP 429, status-200 provider errors, denied access, upstream failure, HTML, redirects, oversized/invalid bodies, timeouts and transport failure return fixed error codes. Provider messages, request URLs and credentials are hidden. A throttle carries a bounded retry hint; the operator must honor it before another invocation.

## Repeatable checks without accounts

Use supported Node 24.22.0:

```sh
npm ci
npm test
npm run test:providers
```

The second command includes seven history contract tests. The third starts **Postman CLI 1.76.0** on a loopback port, runs four real Node-fetch HTTP tests, checks traffic from both providers and stops its own process tree. The first run downloads the pinned CLI using npm; it is test tooling, not an app dependency or deployed service. No Postman login or provider key is needed. Only the exact fixture key is accepted for loopback overrides, and production rejects overrides entirely.

The simulation covers nine synthetic regional mappings (US, UK, Japan, India, Hong Kong, Australia, South Africa, UAE and Brazil), exact prices beyond JavaScript's integer precision, GBX units, composite identity, provider errors, metadata/date rejection, declared/chunked oversized bodies, no redirect following, timeout, authorization expiring during a request, production override rejection and independent provider failure. It verifies 25 Twelve Data requests and three EODHD requests, catching retries or unexpected network attempts. It does not prove real-world coverage, exchange calendars, licensing, source freshness or production throughput.

Definitions live in `postman/mocks/` and `postman/simulations/`. Ignored logs/report are written to `.local/provider-simulation/`; do not publish provider logs. Public-provider acceptance still requires actual authorized responses and source comparisons.

During this slice, the dependency audit flagged Vercel CLI configuration's pinned Zod 4.1.11 under the updated [GHSA-mrhx-c7xc-m3w5 advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5). A targeted root override resolves its existing Zod dependency to 4.6.7, already used by the application. The existing CLI configuration package is declared as a root test dependency so npm's workspace resolver applies the override consistently; no Vercel API/Functions downgrade is used. A compatibility check verifies the vendor's actual resolved version and valid/invalid parsing. Clean-install CI, production-only container installation and audit remain release gates. This concerns the v2 dependency tree; preserved legacy coursework remains a separate audit scope.

## Private operator probe after account review

There is deliberately no provider-key variable in the web app. Keep research credentials in ignored `.local/market-data/` files, separate from hosted auth/database files.

1. Copy the examples below into `.local/market-data/`. Replace the synthetic listing and mapping with a real, dated, verified catalog mapping. Use the actual provider's currency/unit conventions; do not infer them from fixture values.
2. Review the account's private research terms, including the requested venues. Keep the underlying agreement privately. Update the access record and its evidence reference only when approval is established. Public display, simulation, retention and replay remain independent decisions.
3. Save the provider key as `{"apiKey":"..."}` in a separate private JSON file. Keep it out of command arguments, screenshots, chat and commits. Do not enable debug fetch/proxy URL logging.
4. Run once, substituting the private file paths:

```sh
npm run market-data:probe -- --plan .local/market-data/plan.json --access .local/market-data/access.json --credentials .local/market-data/credentials.json
```

The probe validates before sending a single request and prints only a count/date/provenance summary. It does not print or save the returned prices. Approval does not authorize importing them into MySQL or displaying them publicly. Do not change the example's `unknown` status just to make the command pass.

`plan.json` template (fictional and not suitable for a live call):

```json
{
  "provider": "twelvedata",
  "listingId": "fixture-us",
  "symbol": "FIX_US",
  "mic": "XNAS",
  "providerExchange": "NASDAQ",
  "providerCurrency": "USD",
  "quoteCurrency": "USD",
  "settlementCurrency": "USD",
  "quoteUnitDenominator": "1",
  "timezone": "America/New_York",
  "from": "2026-10-01",
  "to": "2026-10-02",
  "mappingEvidenceRef": "replace-with-verified-mapping-reference"
}
```

`access.json` template (denies access by default):

```json
{
  "provider": "twelvedata",
  "purpose": "private_research",
  "dataset": "daily_history",
  "status": "unknown",
  "listingIds": ["fixture-us"],
  "reviewedAt": "2026-10-24T00:00:00Z",
  "expiresAt": "2026-10-25T00:00:00Z",
  "evidenceRef": "replace-with-reviewed-private-terms-reference"
}
```

## Remaining M5 work

| Gate | Current state / next evidence |
| --- | --- |
| Account-specific rights | No current provider account. Seek an educational allowance; obtain venue/dataset/use-specific terms before public use. |
| Real contract acceptance | Capture and compare authorized source responses privately; check aliases, actual unit conventions, adjustments, history completeness and failure shapes. |
| Worldwide denominator | 2,889 MIC reference rows remain unclassified; acquire the actual prior effective source and classify cash-equity venues with dated evidence. The October update becomes effective 26 October, not early. |
| Provider coverage | No production coverage is enabled. Compare directory/history/EOD/delayed/live/actions/FX and usage rights per venue/segment/listing; retain smaller/frontier gaps. |
| Runtime data service | Add durable shared provider/feed budgets, active subscriptions, leases, cache freshness/retention and quality gates before browser requests or workers can call providers. |
| Execution | Verify local sessions/holidays/breaks, ticks/lots/bands, halts, actions and FX; enforce freshness and permissions independently of chart availability. |
| Rollout | Select a genuinely entitled multi-region batch, document cost and fidelity, verify isolated outages, then enable explicit modes behind reviewed capabilities. |

The next useful owner action, when ready, is to request terms rather than buy a plan blindly. A message the owner can send:

> I maintain TradeCrafters, a non-commercial student portfolio paper-trading demo hosted publicly on Vercel. It uses virtual balances, no brokerage connection or real-money execution, and aims to cover exchanges worldwide. Is there a free educational allowance for this use? Please specify permitted venues and datasets, public chart/quote display, simulated executions, attribution, cache/history retention, replay, concurrent users, API/stream limits and any exchange fees or approvals. Please distinguish private development rights from public deployment rights. We can keep unsupported venues disabled and accept EOD or delayed modes with clear labels.

This draft has not been sent. Do not include secrets or private user records in a provider inquiry. M5 and worldwide coverage stay open until their real acceptance gates are met.
