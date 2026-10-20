# Research sources and limitations

All references below were checked on **20 October 2026**. Prefer current provider documentation and written account-specific terms at implementation time. Statements about prices, quotas, product availability and licensing are snapshots, not permanent guarantees. The technical proposals and design interpretations are this project's recommendations.

## Repository evidence

- [Audited GitHub baseline](https://github.com/DuhItzAniket/TradeCrafters/tree/8fa026527631bbfa51bcd0ba5e3412eaa8df5b16), reviewed from a fresh clone, with file/line evidence in the audit.
- [Dependency summary](evidence/dependency-audit.json): npm audit output summarized with lockfile hashes; includes tooling/transitive findings.
- [Isolated probe harness](evidence/verify-legacy.cjs) and [captured results](evidence/legacy-probe-results.json): fake database only; no external account or service was contacted by the probes.
- [Sanitized historical configuration inventory](evidence/history-configuration.json): inspected the retained archive in memory; no credential values, live validation, or history rewriting.

## Market data

| Primary source | Used for |
| --- | --- |
| [ISO 10383 MIC register](https://www.iso20022.org/market-identifier-codes) | Global venue identity and operating/segment/effective-date handling; not every MIC is an equity exchange |
| [Twelve Data exchange directory](https://twelvedata.com/exchanges) and [July 2026 directory update](https://twelvedata.com/news/july-2026-update) | Worldwide discovery differs from actual supplied price coverage |
| [Twelve Data EOD coverage/licensing note](https://support.twelvedata.com/en/articles/12682324-end-of-day-eod-pricing-market-data) | Per-market historical/EOD availability and licensing gaps; no universal live assumption |
| [EODHD exchange API](https://eodhd.com/financial-apis/exchanges-api-list-of-tickers-and-trading-hours) | Provider exchange codes, MIC mapping, composite universes and endpoint-specific calendar identifiers |
| [EODHD pricing](https://eodhd.com/pricing), [business pricing](https://eodhd.com/commercial-pricing) and [license terms](https://eodhd.com/financial-apis/commercial-vs-personal-license-use) | Broad-coverage personal versus public/business procurement; internal use is distinct from external display |
| [EODHD data sources](https://eodhd.com/financial-apis/our-data-sources-and-data-partners) | Exchange versus indicative/derived provenance requires endpoint/venue-specific confirmation |
| [JPX cash-equity sessions](https://www.jpx.co.jp/english/equities/trading/domestic/01.html) | Local morning/afternoon session requirements |
| [HKEX securities-market operations](https://www.hkex.com.hk/Global/Exchange/FAQ/Securities-Market/Trading/Securities-Market-Operations?sc_lang=en) | Board-lot versus odd-lot behavior as a venue-policy requirement |
| [LSE quote/trade display](https://www.londonstockexchange.com/stock/SGBX/wisdomtree/company-page) | Distinguishing minor quote units from major cash currencies |
| [Alpha Vantage support](https://www.alphavantage.co/support/) | Normal daily quota, verified educational/open-source exception, premium real-time/delayed entitlements |
| [Alpaca Market Data API](https://docs.alpaca.markets/us/docs/about-market-data-api) | IEX versus wider coverage, plan quotas and stream limits, recent historical restrictions |
| [Alpaca paper trading](https://docs.alpaca.markets/us/v1.4.2/docs/paper-trading) | Simulation limitations; not authorization to redistribute data |
| [Twelve Data business pricing](https://twelvedata.com/pricing-business) | Credits, Basic limits, business display offerings and add-ons |
| [Twelve Data commercial/personal usage](https://support.twelvedata.com/en/articles/5332349-commercial-and-personal-usage) | Educational/internal versus external-display/redistribution conditions |
| [Twelve Data terms](https://twelvedata.com/terms) | Distinction between internal/non-display and external uses |
| [Massive stocks pricing](https://massive.com/pricing?product=stocks) | Individual tiers and freshness |
| [Massive business](https://massive.com/business) | Business FMV offering and exchange-feed expansions; separate commercial procurement |
| [Tiingo](https://www.tiingo.com/) and [IEX stream documentation](https://www.tiingo.com/documentation/websockets/iex) | Product families, derived prices versus licensed TOPS, commercial inquiries |
| [Finnhub pricing](https://finnhub.io/pricing) and [rate limits](https://finnhub.io/docs/api/rate-limit) | Candidate investigated; exact current pricing was not reliably available in the renderer and is intentionally unverified |
| [Kite terms](https://kite.trade/terms/) | Explicit virtual/mock-trading and public-display restrictions |
| [Upstox Market Data Feed V3](https://upstox.com/developer/api-documentation/v3/get-market-data-feed/) | Technical feed shape only; simulator authorization unverified |
| [NSE data-sharing policy](https://www.nseindia.com/static/market-data/nse-data-policy) | Agreement-defined use/redistribution; academic access does not automatically permit public replay |
| [NSE member circular, 20 April 2023](https://nsearchives.nseindia.com/content/circulars/COMP56426.pdf) | Member-data misuse for virtual trading; document date, rather than search-engine crawl date, determines its age |

## Product and implementation

| Primary source | Used for |
| --- | --- |
| [TradingView paper-trading functionality](https://www.tradingview.com/support/solutions/43000516466-paper-trading-main-functionality/) | Chart/ticket/position workflow benchmark |
| [IBKR paper-account glossary/limitations](https://www.interactivebrokers.com/campus/glossary-terms/paper-trading-account/) | Documented execution-model limitations |
| [React: Sunsetting Create React App](https://react.dev/blog/2025/02/14/sunsetting-create-react-app) | Supported migration direction for the client build |
| [Better Auth MySQL](https://better-auth.com/docs/adapters/mysql) | Supported library/database combination, not a substitute for an implementation security review |
| [MySQL InnoDB best practices](https://dev.mysql.com/doc/refman/8.0/en/innodb-best-practices.html) | Transactions and locking reads |
| [OWASP API Security Top 10](https://devguide.owasp.org/en/07-training-education/07-api-top-ten/) | Authentication, object access, resource-consumption and configuration risk categories |
| [OWASP object authorization](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/) | Account/resource ownership review |
| [Lightweight Charts](https://tradingview.github.io/lightweight-charts/) and [NOTICE](https://github.com/tradingview/lightweight-charts/blob/master/NOTICE) | Chart-rendering candidate and required license/attribution review |
| [WCAG 2.2](https://www.w3.org/TR/WCAG22/) | Accessibility target; no formal conformance audit has been completed |

## Hosting and operations

| Primary source | Used for |
| --- | --- |
| [Vercel pricing](https://vercel.com/pricing) and [Hobby plan](https://vercel.com/docs/plans/hobby) | Personal-use eligibility, quotas and budget envelope |
| [Vercel cron pricing/limits](https://vercel.com/docs/cron-jobs/usage-and-pricing) | Scheduling constraints that affect unattended polling |
| [Vercel WebSockets](https://vercel.com/docs/functions/websockets) | Current beta availability, finite duration, reconnect/distributed-state implications |
| [Aiven MySQL free-tier documentation](https://aiven.io/docs/products/mysql/concepts/mysql-free-tier) | Resource, connection, inactivity, network and availability constraints |
| [Aiven MySQL pricing](https://aiven.io/pricing/mysql) | Free and developer price snapshots |
| [Neon pricing](https://neon.com/pricing) | PostgreSQL alternative considered; no database migration proposed |
| [AWS ECS load balancing](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-load-balancing.html) | Container deployment with Fargate/ALB |
| [AWS Fargate pricing](https://aws.amazon.com/fargate/pricing/) | Resource/time-based pricing, not an all-inclusive deployment quote |
| [AWS App Runner availability notice](https://docs.aws.amazon.com/apprunner/latest/dg/apprunner-availability-change.html) | Avoid reliance on an outdated new-account hosting assumption |
| [RDS automated backups](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_WorkingWithAutomatedBackups.Enabling.html) | Backup configuration and later recovery planning |

## What was not established

No production deployment was found or exercised as part of this review. The older archive's environment configuration was inspected, but no comprehensive all-format Git-history secret scan, authenticated browser test of the legacy app, live provider trial, account eligibility check, signed data agreement, user study, cloud cost quote, or infrastructure deployment was performed. The missing tracked database module and incompatible schemas prevent treating the legacy project as a verified runnable baseline.

Provider websites can change, differ by endpoint/account/region, or render incomplete pricing. Where exact information could not be verified, it is marked unresolved instead of filled with a remembered quota. Business pricing is not inferred from personal plans. Fees, taxes, and exchange rights need account-specific confirmation.

The design study is an original single-USD-listing concept with fictional data. It validates composition and limited interactions, not the later global discovery/multi-wallet UX, market accuracy, production performance, authentication, or trading correctness. The global-scope correction changes the proposed design/contracts; it does not implement venue integrations. Browser checks are recorded in the [verification note](evidence/verification.md).
