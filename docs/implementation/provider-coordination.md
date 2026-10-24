# M5: durable private research coordination

Implementation record, **24 October 2026**. Continues the [historical adapter boundary](provider-history.md) and [M5 #7](https://github.com/DuhItzAniket/TradeCrafters/issues/7). This slice coordinates private daily-history requests; hosted trading still uses fictional data. No provider account, hosted research schema or public market-data endpoint is configured.

## Admission and failure behavior

An operator account represents one actual provider credential/quota pool, shared by every process using it. Do not create an account per symbol or worker to bypass the provider's account-wide allowance. The only feed implemented here is `daily_history`; streaming subscriptions and order evaluators remain later work.

1. Validate the private listing/mapping/access record, current account and feed reviews against the database clock.
2. Lock the account and feed, prune expired records and inspect a permission-bound cache key. A hit is revalidated and keeps its original observation timestamp.
3. Otherwise check account cooldown, concurrent leases and both account/feed minute/day credit budgets. Charge the reviewed request cost and commit a random-token lease **before HTTP**.
4. Send one bounded request outside the database transaction. Publish only while the same lease token, policy generations and private approvals remain valid.

There are no refunds, retries or automatic provider substitutions. A crash after reservation can waste credits but cannot make the allowance reusable. UTC fixed windows are an explicit policy choice requiring account-specific review, not a claim about every vendor plan. Backward clock movement cannot reset charged windows. Lease expiry allows another worker to proceed; late results cannot replace the new worker's result. HTTP 429 persists an account-wide cooldown; denied access blocks that account and clears its leases/cache until an operator reviews and reconfigures it. Other provider accounts continue independently.

Policy changes invalidate outstanding leases and cached prices while preserving charged counters and cooldown. The account/feed state uses short serialized transactions, a two-second lock wait and a two-connection, non-queueing pool. It does not hold locks during provider HTTP. Remote connections require verified TLS using the existing database configuration contract.

## Separate storage and retention

`packages/database/provider-migrations/0001_research_store.sql` creates five tables and a bounded expiry event in a **dedicated database**. This is independent of the application's eighteen migrations and 48-table backup contract. Pool configuration refuses the application database and never falls back to `DATABASE_URL`.

| Bound | Maximum / default |
| --- | --- |
| Configured account records | 32 |
| Concurrent requests | 8 per account/feed |
| Lease | 15–60 seconds; HTTP timeout remains at most 10 seconds |
| Daily-history response | 31 days/bars, 256 KiB decoded HTTP body |
| Cached payload | 256 KiB per result |
| Cache capacity | 128 entries and 4 MiB per account, with separate feed caps |
| Cache freshness | **No-store by default**; reviewed TTL at most 300 seconds |

Cache expiry is also bounded by the listing access, account and feed review deadlines. Cache contents cannot enable public display or execution. A positive TTL requires explicit storage/backup approval and finite capacity. Invalid payloads, altered expiry metadata or checksums fail closed and are removed. Insertion and LRU eviction share a transaction, so a failed insertion restores the previous cache.

The SQL event deletes at most 512 expired rows every ten seconds using the expiry index. Cache paths require the server scheduler and this event to be enabled. This is bounded asynchronous cleanup, **not instantaneous physical deletion or an availability SLA**. Server downtime, event backlog, database logs and backups can extend physical retention. At maximum account count the aggregate cache cap is 128 MiB, before database overhead; hosting capacity and connection budgets must be reviewed before provisioning it.

The application logical backup excludes this separate schema. Managed-service backups would still include it if hosted on that service. Real caching therefore requires terms covering backup/log retention and outages, plus a reviewed cleanup/restore procedure; restoring a research database must leave access disabled until reviews are revalidated. None of those hosted acceptance steps is claimed here. Leave TTL zero if retention rights are unresolved.

## Operator setup after rights and budget review

The automated fixture command below provisions its own disposable local database. For real operator use, provision a separately approved empty database named `tradecrafters_marketdata` or `tradecrafters_marketdata_<lowercase suffix up to 16 characters>`. Keep its initialization identity scoped to that database; initialization requires its DDL and EVENT permissions. A future hosted worker needs separately reviewed restricted grants, aggregate connection caps and credential custody. Do not give the web identity access or copy research credentials into Vercel.

Save database configuration privately in ignored `.local/market-data/provider-store.env`:

```dotenv
PROVIDER_DATABASE_URL=mysql://RESEARCH_USER:ENCODED_PASSWORD@HOST:PORT/tradecrafters_marketdata
PROVIDER_MYSQL_SSL=true
PROVIDER_MYSQL_SSL_CA_FILE=/private/path/to/provider-database-ca.pem
```

These are placeholders. Use a URL-encoded password; never paste credentials into chat or shell arguments. Local loopback fixtures can omit TLS; remote TLS cannot be disabled. `PROVIDER_MYSQL_SSL_CA` also supports a PEM value when needed. All `PROVIDER_*` assignments, including multiline certificates, are excluded by local web-env generation; release preflight rejects them in the web environment.

Use Node 24.22.0 from the repository root. Initialization refuses a nonempty or incompatible schema; interrupted DDL requires inspection of the dedicated schema rather than an automatic destructive reset.

```sh
node --env-file=.local/market-data/provider-store.env --import tsx scripts/market-data/store.ts init
node --env-file=.local/market-data/provider-store.env --import tsx scripts/market-data/store.ts account research-account .local/market-data/account.json
node --env-file=.local/market-data/provider-store.env --import tsx scripts/market-data/store.ts feed research-account .local/market-data/feed.json
```

`account.json` starts disabled with zero allowance. Replace review dates/references only after reviewing the actual plan. Existing window consumption is retained when reconfiguring it.

```json
{
  "provider": "twelvedata",
  "enabled": false,
  "reviewedAt": "2026-10-24T00:00:00Z",
  "expiresAt": "2026-10-25T00:00:00Z",
  "evidenceRef": "unreviewed-account-placeholder",
  "resetBasis": "UTC_fixed_windows",
  "minuteCredits": 0,
  "dayCredits": 0,
  "maxConcurrent": 0,
  "maxCacheEntries": 0,
  "maxCacheBytes": 0
}
```

`feed.json` also starts disabled. Its listing allowlist is not a substitute for the separate private access record or mapping evidence.

```json
{
  "dataset": "daily_history",
  "enabled": false,
  "reviewedAt": "2026-10-24T00:00:00Z",
  "expiresAt": "2026-10-25T00:00:00Z",
  "evidenceRef": "unreviewed-feed-placeholder",
  "listingIds": ["fixture-us"],
  "minuteCredits": 0,
  "dayCredits": 0,
  "requestCredits": 1,
  "maxConcurrent": 0,
  "leaseMs": 15000,
  "cache": {
    "ttlSeconds": 0,
    "maxEntries": 0,
    "maxBytes": 0,
    "backupsApproved": false,
    "evidenceRef": "unreviewed-retention-placeholder"
  }
}
```

After account/feed and listing permissions are actually approved, run the [private probe](provider-history.md#private-operator-probe-after-account-review) with the same env file and `--account research-account`. The probe prints aggregate provenance and cache-hit status, never prices or keys. An operator can explicitly remove expired/revoked account records from cache/leases without resetting quotas:

```sh
node --env-file=.local/market-data/provider-store.env --import tsx scripts/market-data/store.ts sweep research-account
```

This command retains the account/feed configuration and counters. To revoke an active policy, configure it disabled, which also clears its cache and leases. Review denied/throttled accounts before re-enabling; do not loop the probe on failure.

## Verification without a provider account

Keep the local Docker MySQL service running, then:

```sh
npm test
npm run test:provider-store
```

The second command creates a random, run-owned schema and user on loopback MySQL, uses actual SQL transactions and real HTTP against local Postman stand-ins, then drops only those fixture resources. It never applies the research schema to the app database or changes web grants. Logs stay ignored under `.local/provider-simulation/`; only fixture API keys are used.

Fifteen coordination integration tests cover competing pools, dual credit limits, reconfiguration, clock rollover, process death with real lease expiry/takeover, fencing, revocation, no-store/capacity/LRU, invalid cache/expiry metadata, idle event cleanup, disabled maintenance, failed-insert rollback, access expiry, HTTP deduplication, shared cooldown/denial, independent providers, unavailable database and account-count bounds. Together with the four adapter HTTP tests, the run expects exactly **30 Twelve Data and four EODHD fixture requests**. These are authored contracts, not captured real provider responses or load acceptance.

The full suite contains **82 unit/configuration, 19 provider HTTP/MySQL and 96 application HTTP/MySQL checks**. `npm run test:providers` remains the smaller four-test HTTP-only option (25 Twelve Data/three EODHD requests). CI runs the combined provider-store command once.

M5 remains open for real account terms, source comparisons, current worldwide venue classification, calendars/rules/actions, deployment capacity and an entitled pilot. M3 student feedback remains independent. This infrastructure adds no verified real-exchange coverage.
