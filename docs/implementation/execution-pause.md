# Execution pause and rollout

This M4 control is separate from account funding. Administrators can pause or resume **new buy/sell orders and explicit currency conversions**, with an operational reason and a fresh five-minute session proof. Creator attribution remains Aniket Kumar and Annapurna S. Real feeds and real orders remain disabled.

## Contract

`GET /api/admin/control` returns `control.paused` (funding), `control.executionPaused` and the latest audit events. `POST` accepts:

```json
{"scope":"execution","paused":true,"reason":"Investigating an execution service incident"}
```

`scope: "funding"` changes opening grants/reset funding. Omitting scope retains the earlier funding behavior. Unknown scopes, extra fields, nonboolean states and reasons outside 10–300 characters are rejected. Both controls require current administrator authorization, a verified identity, enabled factor and an unexpired session proof; writes recheck these inside the transaction. A reason and `execution_pause`/`execution_resume` audit event commit with the flag.

New order/FX operations rejected during a pause receive a durable `409 / EXECUTION_PAUSED` receipt. Their native balances, positions and journals do not change. Retry/recovery with the same key returns its original receipt, including a previously completed operation. Resuming does not turn a rejected key into a fill: review a fresh quote and use a new operation key. Portfolio, activity and saved-receipt reads remain available. Funding, empty wallets and account reset follow their separate existing controls.

## Transaction boundary and older deployments

Order/FX/reset transactions acquire a shared `simulation_control` row lock **before** user/account/session locks and hold it through commit. The administrator writer takes the same control row exclusively before checking authorization. A pause waits for admitted executions to finish; it does not cancel or undo committed trades. An operation waiting behind the writer sees the current committed flag. Role revocation or proof expiry while a pause request waits is rechecked before the write.

Migrations `0009`–`0011` add a false-by-default flag, audit actions and `BEFORE INSERT` guards on `orders` and `fx_conversions`. The guards read the flag with a locking read and fail closed if paused or missing. They also reject inserts from older deployments that do not implement the application check. Existing transactional callers roll back their earlier financial writes when an insert fails. Older clients may report a generic service error rather than the new durable pause receipt; recover the key before retrying. This is protection for application transaction paths, not a defense against a privileged database operator who can alter triggers or accounting tables.

## Migration and release

1. Back up the intended schema and retain independent recovery access. Confirm the target and use the separate migration identity, never the web runtime.
2. Apply the three additive migrations **before** the new application deploys. Funding state is preserved and execution starts available. The runtime grant manifest is unchanged. The migration identity needs `TRIGGER` on `orders` and `fx_conversions`, plus the existing DDL and control-table read privileges. Retain its trigger-definer identity and permissions.
3. On managed MySQL, inspect the existing binary-log/trigger requirements first. Do not grant SUPER to the web identity or weaken server-wide protections to bypass a failed migration. The selected Aiven service already permits trusted trigger creation; scoped trigger permissions are still required. [MySQL binary logging requirements](https://dev.mysql.com/doc/refman/8.4/en/stored-programs-logging.html).
4. Local `npm run db:migrate` uses the retained Docker container's root socket only for marked `CREATE TRIGGER` files. Normal migrations retain the operator connection and shared migration lock. No global setting or runtime privilege changes. The localhost, explicit development mode, root-env presence, container and SQL-prefix guards must pass.
5. Compound trigger files carry `-- @single-statement` and are sent intact rather than splitting the body at semicolons. The marker is for reviewed repository migrations, never uploaded SQL. DDL failure leaves an incomplete marker. Inspect actual schema/trigger presence before an explicit repair; do not delete markers or rerun blindly.
6. Recheck migration checksums, both trigger bodies/definers, restricted runtime TLS/grants and ordinary reads. Then deploy the reviewed commit. Privately verify the owner's session, load both controls, pause, confirm rejected practice orders/FX without financial changes, recover an existing receipt, and resume. Record the audit, final flags and reconciliation in [M4 #6](https://github.com/DuhItzAniket/TradeCrafters/issues/6). Do not put codes, cookies, identities or raw driver errors into evidence.

Code rollback must retain these schema additions and guards. A rollback to older application code keeps database insert enforcement but loses the new interface/receipt behavior. Never drop the guards while execution is paused, and never roll back to pre-M2 accounting semantics. Trigger definitions/definers must be included in backup and verified after a restore; row-count equality alone is insufficient. A provider restore may need controlled definer reprovisioning. No hosted disaster-recovery guarantee is implied by a local rehearsal.

## Verification boundary

Five real HTTP/MySQL integration cases cover paused buy/sell/FX, independent funding behavior, unchanged accounting, durable replay before/after resume, old-style database inserts, writers/readers waiting in both directions, and queued writes losing proof/role authorization. Lock waits are observed through MySQL rather than assumed from a sleep. A contract check covers default/explicit/unknown scopes. The encrypted recovery rehearsal checks the restored triggers actually reject inserts and rolls its probes back.

The suite is **138 checks: 57 domain/configuration and 81 integration**, plus build/audit/recovery/container verification. Local evidence and CI do not substitute for the private hosted administrator walkthrough; its deployment-specific state is tracked in #6. Trusted ingress abuse controls, application request capacity, independent factor recovery, hosted restore/rollback, key custody and external audit/retention/cost work remain M4 gates. M3 student feedback remains deferred.
