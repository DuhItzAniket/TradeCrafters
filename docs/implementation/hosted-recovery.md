# Hosted recovery and capacity

Updated 21 October 2026 UTC. M4 remains open until all of its operational gates pass. This record covers a real encrypted backup and an isolated restore on the hosted MySQL service, plus bounded application capacity/overload checks. No production account was reset, restored or replaced.

## Recovery contract

`scripts/backup.ts` reads one consistent InnoDB snapshot while holding the same advisory lock as the migration command. It checks every applied migration checksum and completion marker. The bounded logical archive contains table/column names and parameter data, never executable SQL, grants or a restore destination. JSON stays UTF-8, timestamps stay UTC strings and large integer/decimal strings retain precision. Current limits are 100,000 rows / 64 MiB; this is a small-demo tool, not a general database backup product.

The existing AES-256-GCM envelope authenticates the version header and ciphertext before returning any plaintext. A fresh nonce is used for every archive. Only ciphertext and aggregate reports are written to disk. Wrong keys, modified ciphertext and unsupported/schema-mismatched archives fail before restore SQL runs. Credentials, rows, provider responses and cookies are never printed.

`scripts/rehearse-hosted-recovery.ts --create-disposable-hosted-restore` creates a new random `tc_restore_…` schema and a separate TLS-required identity capped at two connections. It applies reviewed migrations, refuses a data-bearing target, restores parameterized rows in bounded batches and checks foreign keys. Generated columns are recomputed by MySQL. INSERT guards and expiry events are temporarily absent only in this unexposed target, then recreated from the reviewed migrations. It compares every table/column/row fingerprint before any expiry jobs run.

After comparison, the recovery procedure discards restored sessions, step-up proofs, OAuth state and cached provider tokens. Restoring a backup must not revive a previously revoked cookie. User identities, encrypted factors and fictional accounting records remain available for a separately verified recovery. The environment's authentication secret is required to decrypt enrolled factors; protecting the SQL archive alone is insufficient.

The target has no web route, OAuth app or application runtime grants. Cleanup removes only the schema and identity successfully created by that invocation. A cleanup failure is an unsuccessful rehearsal that requires operator inspection. Existing schemas and users are never cleanup candidates.

## Operator commands

Use Node 24.22.0. Keep these configurations under ignored private storage. Never import them into Vercel, overwrite either local app env file or commit them.

```sh
node --env-file=.local/hosting/m4-recovery.env --import tsx scripts/backup.ts

# BACKUP_ARCHIVE selects the encrypted output; never supply plaintext SQL.
node --env-file=.local/hosting/m4-recovery.env --import tsx \
  scripts/rehearse-hosted-recovery.ts --create-disposable-hosted-restore
```

The backup configuration requires `DATABASE_URL` for the source operator/read identity, verified TLS, `MYSQL_POOL_SIZE=1`, `BACKUP_EXPECTED_DATABASE`, `BACKUP_DIRECTORY` and `BACKUP_KEY_FILE`. The key is 32 random bytes represented as 64 hexadecimal characters, outside the archive directory. The restore rehearsal additionally needs `RESTORE_OPERATOR_DATABASE_URL` for creating its new scoped identity/schema on the same host, and `BACKUP_ARCHIVE`. That privileged connection never enters a web process.

The Windows execution used owner-only ACLs for the private custody and backup directories. Unix file modes alone do not establish Windows access protection. No key, authentication secret, raw archive or private operator manifest belongs in an issue or screenshot.

Independent custody is a separate owner check: retain the backup key and hosted authentication secret in a private vault/offline encrypted medium, separate from ciphertext and the running computer/service. Copy ciphertext/report to owner-controlled off-computer storage and verify retrieval. Creating a local kit does not complete that check. Scheduling, retention and external audit protection are also separate from one successful backup.

## Hosted observations

The actual source was the dedicated hosted synthetic schema. At **2026-10-21T14:15:35.910Z**, the encrypted snapshot contained **48 tables / 5,971 rows**, with a 1,405,888-byte envelope. Its read-back authentication passed. Private identity/provider/session records are inside the encrypted artifact and are not published here.

The initial hosted restore passed at **14:20:57.072Z**: every row matched, journals/wallets reconciled, one restored session was discarded, provider tokens were cleared, and two guards/two enabled maintenance events were rebuilt. The newly created schema/user were removed. That initial per-row restore took 272,097 ms; it prompted bounded batching rather than a larger connection pool.

The batched version passed at **14:23:25.597Z** using the same retained archive: restore/comparison took **27,594 ms**, and the whole create/migrate/restore/reconcile/scrub/maintenance/checksum sequence took **37,145 ms**. Again, all rows matched and the temporary schema/user were removed. Source financial records were read-only throughout. The archive was 470 seconds old at completion; that is an observed snapshot age, not a promised RPO.

These measurements include this operator machine/network and a very small database. They establish neither a provider PITR/fork, recovery after total regional loss, a fresh-machine credential handoff, nor a production RTO/SLA. The owner must recover custody and provision a replacement provider in a real incident before these database-level steps can run.

The local/CI drill now additionally runs this logical path against real disposable MySQL: all rows/FKs match, an existing target and wrong target name reject, restored session authority is discarded, maintenance is recreated and migration checksums still match. The previous independent encrypted SQL restore, wrong-key/tamper and accounting/guard/cap checks remain.

## Bounded application capacity

`scripts/measure-capacity.ts <intended-origin> --bounded-read-probe` is restricted to the actual stable demo address. It issues 72 valid paginated directory/chart reads, never signs in or writes finance, and stops before a higher tier if a request fails or p95 exceeds the preselected three-second personal-demo budget. The limit is an acceptance threshold, not an advertised service guarantee.

On **21 October 2026, 14:22:27–14:22:38Z**, all reads passed with no-store responses; catalog pages stayed at 30 records and the largest response was 6,758 bytes.

| Concurrency | Reads |    p50 |      p95 | Observed requests/second |
| ----------- | ----: | -----: | -------: | -----------------------: |
| 1           | 24/24 | 191 ms |   276 ms |                     4.87 |
| 2           | 24/24 | 187 ms |   287 ms |                     9.58 |
| 4           | 24/24 | 253 ms | 1,341 ms |                    10.35 |

This includes client-to-Vercel network time. A short burst's rate cannot be sustained beyond the [persistent per-minute allowances](request-admission.md). An initial probe stopped on a misspelled fictional listing ID in the harness; the path was corrected and the initial failure retained. No application limit was disabled or raised.

`scripts/exercise-overload.ts --briefly-exercise-hosted-ceiling` explicitly reserves all twelve runtime connections briefly, with an automatic eight-second release deadline. It destroys only connections it acquired. On **14:25:05–14:25:14Z**, actual directory/chart/session reads returned sanitized uncached **503 / SERVICE_UNAVAILABLE**, with **Retry-After: 1**; independent liveness stayed 200. After release, the actual paginated directory recovered to 200. No financial write, owner session export, cap change or global pause was used. The [earlier ingress exercise](request-admission.md) separately covers 429 and next-window recovery.

## Actual hosting and environment boundary

The authenticated console showed **Vercel Hobby**, all eleven project environment variables scoped **Production only**, and **no linked shared variables**. PR previews receive no production database/OAuth/auth secret. CI generates its own loopback MySQL credentials and fixture server. DB-backed public PR previews remain disabled; an isolated build is not an authenticated acceptance environment.

The Aiven console showed **Developer-1**, one node / 1 CPU / 1 GB RAM / 8 GB storage in **DigitalOcean Singapore**, covered by an active trial. It did not show a Free service. Published [MySQL pricing](https://aiven.io/pricing/mysql) lists Developer at $5/month and limits it to a disaster-recovery backup rather than user-selected PITR. The console's Fork service button was disabled. [Trial rules](https://aiven.io/docs/platform/concepts/service-pricing) warn that non-free services without a payment method can power off when credits/trial end. No billing or plan change was performed by these checks.

Observed provider backup configuration: **07:44 UTC**, backup location **do-sgp1**, with full backups completed at **20 October 19:59:35Z** and **21 October 07:59:35Z**. A visible list of two backups is not a two-day retention promise. Provider [backup documentation](https://aiven.io/docs/products/mysql/concepts/mysql-backups) makes retention plan-dependent. The encrypted logical restore supplies a tested portable path; provider disaster-recovery behavior has not been induced by destroying/replacing the live service.

M4's remaining custody, cost decision, rollback, recovery and retention gates stay explicit in the [release runbook](deployment-foundations.md#remaining-m4-acceptance). Worldwide real-market integration remains M5/M7; real prices and funds were not enabled.
