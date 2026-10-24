import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  createPool,
  type Pool,
  type PoolConnection,
  type RowDataPacket,
} from "mysql2/promise";
import { databaseConfiguration } from "./pool";
import {
  accountPolicySchema,
  feedPolicySchema,
  researchAccountId,
  reviewCurrent,
  budgetWindow,
  historyRequestKey,
  CoordinationFault,
  type AccountPolicy,
  type FeedPolicy,
} from "../../domain/src/provider-coordination";
import {
  authorizedHistoryPlan,
  researchAccessSchema,
  validatedCachedHistory,
  HistoryFault,
  type HistoryPlan,
  type ResearchAccess,
  type DailyHistory,
} from "../../domain/src/provider-history";

const dataset = "daily_history";
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const dedicated = (value: unknown) =>
  typeof value === "string" &&
  /^(?:tc_provider_[a-f0-9]{24}|tradecrafters_marketdata(?:_[a-z0-9]{1,16})?)$/.test(
    value,
  );
const schema = readFile(
  new URL("../provider-migrations/0001_research_store.sql", import.meta.url),
  "utf8",
).then((sql) => sql.replace(/\r\n/g, "\n"));
const object = (value: unknown) =>
  typeof value === "string" ? JSON.parse(value) : value;
export function createResearchPool(env: NodeJS.ProcessEnv = process.env): Pool {
  try {
    const url = new URL(env.PROVIDER_DATABASE_URL || "");
    if (!dedicated(url.pathname.slice(1))) throw Error();
    return createPool({
      ...databaseConfiguration({
        DATABASE_URL: env.PROVIDER_DATABASE_URL,
        MYSQL_SSL: env.PROVIDER_MYSQL_SSL,
        MYSQL_SSL_CA: env.PROVIDER_MYSQL_SSL_CA,
        MYSQL_SSL_CA_FILE: env.PROVIDER_MYSQL_SSL_CA_FILE,
        MYSQL_POOL_SIZE: "2",
      }),
      waitForConnections: false,
      queueLimit: 0,
    });
  } catch {
    throw new CoordinationFault("CONFIGURATION");
  }
}
async function scope(connection: PoolConnection) {
  const [rows] = await connection.query<RowDataPacket[]>(
    "SELECT DATABASE() AS name",
  );
  if (!dedicated(rows[0].name)) throw new CoordinationFault("CONFIGURATION");
}
export async function initializeResearchStore(pool: Pool) {
  const connection = await pool.getConnection();
  let locked = false;
  try {
    await scope(connection);
    const [lock] = await connection.query<RowDataPacket[]>(
      "SELECT GET_LOCK(CONCAT(DATABASE(),':init'),2) AS acquired",
    );
    if (Number(lock[0].acquired) !== 1)
      throw new CoordinationFault("UNAVAILABLE");
    locked = true;
    const [tables] = await connection.query<RowDataPacket[]>("SHOW TABLES");
    const sql = await schema,
      checksum = hash(sql);
    if (tables.length === 0) {
      for (const statement of sql
        .replace(/^--.*$/gm, "")
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean))
        await connection.query(statement);
      await connection.execute(
        "INSERT INTO research_store_version VALUES(1,?)",
        [checksum],
      );
    } else {
      const [version] = await connection.query<RowDataPacket[]>(
        "SELECT checksum FROM research_store_version WHERE singleton=1",
      );
      if (tables.length !== 5 || version[0]?.checksum !== checksum)
        throw new CoordinationFault("CONFIGURATION");
    }
  } catch (error) {
    if (error instanceof CoordinationFault) throw error;
    throw new CoordinationFault("UNAVAILABLE");
  } finally {
    if (locked)
      await connection
        .query("SELECT RELEASE_LOCK(CONCAT(DATABASE(),':init'))")
        .catch(() => {});
    connection.release();
  }
}
export type ResearchLease = {
  accountId: string;
  requestHash: string;
  token: string;
  accountGeneration: string;
  feedGeneration: string;
  plan: HistoryPlan;
  access: ResearchAccess;
};
type Context = {
  connection: PoolConnection;
  account: RowDataPacket;
  policy: AccountPolicy;
  feed: RowDataPacket;
  feedPolicy: FeedPolicy;
  now: number;
};
type Rejection = { kind: "rejected"; fault: CoordinationFault };
export type ResearchReservation =
  | {
      kind: "cached";
      history: DailyHistory;
      storedAt: number;
      expiresAt: number;
    }
  | { kind: "lease"; lease: ResearchLease };
const reject = (
  code: ConstructorParameters<typeof CoordinationFault>[0],
  retry?: number,
): Rejection => ({
  kind: "rejected",
  fault: new CoordinationFault(code, retry),
});

export class ResearchStore {
  private verified?: Promise<void>;
  constructor(private pool: Pool) {}
  private async compatible() {
    this.verified ??= (async () => {
      const connection = await this.pool.getConnection();
      try {
        await scope(connection);
        const [rows] = await connection.query<RowDataPacket[]>(
          "SELECT checksum FROM research_store_version WHERE singleton=1",
        );
        if (rows[0]?.checksum !== hash(await schema)) throw Error();
      } finally {
        connection.release();
      }
    })();
    try {
      await this.verified;
    } catch {
      this.verified = undefined;
      throw new CoordinationFault("UNAVAILABLE");
    }
  }
  private async transaction<T>(
    run: (connection: PoolConnection) => Promise<T>,
  ): Promise<T> {
    await this.compatible();
    let connection: PoolConnection | undefined;
    let previousWait: number | undefined;
    try {
      connection = await this.pool.getConnection();
      const [settings] = await connection.query<RowDataPacket[]>(
        "SELECT @@session.innodb_lock_wait_timeout AS seconds",
      );
      previousWait = Number(settings[0].seconds);
      await connection.query("SET SESSION innodb_lock_wait_timeout=2");
      await connection.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
      await connection.beginTransaction();
      const value = await run(connection);
      await connection.commit();
      return value;
    } catch (error) {
      await connection?.rollback().catch(() => {});
      if (error instanceof CoordinationFault || error instanceof HistoryFault)
        throw error;
      throw new CoordinationFault("UNAVAILABLE");
    } finally {
      if (connection) {
        if (previousWait !== undefined)
          try {
            await connection.query("SET SESSION innodb_lock_wait_timeout=?", [
              previousWait,
            ]);
          } catch {
            connection.destroy();
          }
        connection.release();
      }
    }
  }
  private async accountTransaction<T>(
    accountId: string,
    run: (context: Context) => Promise<T>,
  ): Promise<T> {
    if (!researchAccountId.safeParse(accountId).success)
      throw new CoordinationFault("CONFIGURATION");
    return this.transaction(async (connection) => {
      const [accounts] = await connection.execute<RowDataPacket[]>(
        "SELECT * FROM research_accounts WHERE account_id=? FOR UPDATE",
        [accountId],
      );
      const [feeds] = await connection.execute<RowDataPacket[]>(
        "SELECT * FROM research_feeds WHERE account_id=? AND dataset=? FOR UPDATE",
        [accountId, dataset],
      );
      if (accounts.length !== 1 || feeds.length !== 1)
        throw new CoordinationFault("DISABLED");
      const [clock] = await connection.query<RowDataPacket[]>(
        "SELECT FLOOR(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000) AS ms",
      );
      const policy = accountPolicySchema.safeParse(object(accounts[0].policy)),
        feedPolicy = feedPolicySchema.safeParse(object(feeds[0].policy));
      if (!policy.success || !feedPolicy.success)
        throw new CoordinationFault("UNAVAILABLE");
      const counters = [
        clock[0].ms,
        ...[accounts[0], feeds[0]].flatMap((row) => [
          row.minute_window,
          row.minute_used,
          row.day_window,
          row.day_used,
        ]),
      ];
      if (
        counters.some(
          (value) => !Number.isSafeInteger(Number(value)) || Number(value) < 0,
        )
      )
        throw new CoordinationFault("UNAVAILABLE");
      return run({
        connection,
        account: accounts[0],
        policy: policy.data,
        feed: feeds[0],
        feedPolicy: feedPolicy.data,
        now: Number(clock[0].ms),
      });
    });
  }
  async configureAccount(accountId: string, input: unknown) {
    const policy = accountPolicySchema.safeParse(input);
    if (!researchAccountId.safeParse(accountId).success || !policy.success)
      throw new CoordinationFault("CONFIGURATION");
    await this.transaction(async (connection) => {
      await connection.query(
        "SELECT singleton FROM research_store_version WHERE singleton=1 FOR UPDATE",
      );
      const [size] = await connection.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS total FROM research_accounts",
      );
      const [existing] = await connection.execute<RowDataPacket[]>(
        "SELECT account_id FROM research_accounts WHERE account_id=?",
        [accountId],
      );
      if (!existing.length && Number(size[0].total) >= 32)
        throw new CoordinationFault("CONFIGURATION");
      await connection.execute(
        "INSERT INTO research_accounts(account_id,policy) VALUES(?,?) ON DUPLICATE KEY UPDATE account_id=account_id",
        [accountId, JSON.stringify(policy.data)],
      );
      await connection.execute(
        "UPDATE research_accounts SET policy=?,generation=generation+1,blocked=false WHERE account_id=?",
        [JSON.stringify(policy.data), accountId],
      );
      await connection.execute(
        "DELETE FROM research_leases WHERE account_id=?",
        [accountId],
      );
      await connection.execute(
        "DELETE FROM research_cache WHERE account_id=?",
        [accountId],
      );
    });
  }
  async configureFeed(accountId: string, input: unknown) {
    const policy = feedPolicySchema.safeParse(input);
    if (!researchAccountId.safeParse(accountId).success || !policy.success)
      throw new CoordinationFault("CONFIGURATION");
    await this.transaction(async (connection) => {
      const [rows] = await connection.execute<RowDataPacket[]>(
        "SELECT account_id FROM research_accounts WHERE account_id=? FOR UPDATE",
        [accountId],
      );
      if (rows.length !== 1) throw new CoordinationFault("CONFIGURATION");
      await connection.execute(
        "INSERT INTO research_feeds(account_id,dataset,policy) VALUES(?,?,?) ON DUPLICATE KEY UPDATE policy=?,generation=generation+1",
        [
          accountId,
          dataset,
          JSON.stringify(policy.data),
          JSON.stringify(policy.data),
        ],
      );
      await connection.execute(
        "DELETE FROM research_leases WHERE account_id=? AND dataset=?",
        [accountId, dataset],
      );
      await connection.execute(
        "DELETE FROM research_cache WHERE account_id=? AND dataset=?",
        [accountId, dataset],
      );
    });
  }
  private allowed(context: Context, plan: HistoryPlan) {
    return (
      !Number(context.account.blocked) &&
      reviewCurrent(context.policy, context.now) &&
      reviewCurrent(context.feedPolicy, context.now) &&
      context.policy.provider === plan.provider &&
      context.feedPolicy.listingIds.includes(plan.listingId)
    );
  }
  async reserve(
    accountId: string,
    input: unknown,
    authorization: unknown,
  ): Promise<ResearchReservation> {
    const result = await this.accountTransaction<
      ResearchReservation | Rejection
    >(accountId, async (context) => {
      const { connection, account, policy, feed, feedPolicy, now } = context;
      const plan = authorizedHistoryPlan(
        input,
        authorization,
        new Date(now).toISOString(),
      );
      const access = researchAccessSchema.parse(authorization);
      if (!this.allowed(context, plan)) return reject("DISABLED");
      if (feedPolicy.cache.ttlSeconds > 0) {
        const [maintenance] = await connection.query<RowDataPacket[]>(
          "SELECT @@event_scheduler AS scheduler,(SELECT STATUS FROM information_schema.EVENTS WHERE EVENT_SCHEMA=DATABASE() AND EVENT_NAME='research_cache_expiry') AS status",
        );
        if (
          maintenance[0].scheduler !== "ON" ||
          maintenance[0].status !== "ENABLED"
        )
          return reject("UNAVAILABLE");
      }
      const key = historyRequestKey(plan, access, new Date(now).toISOString());
      await connection.execute(
        "DELETE FROM research_cache WHERE account_id=? AND expires_at<=?",
        [accountId, now],
      );
      await connection.execute(
        "DELETE FROM research_leases WHERE account_id=? AND expires_at<=?",
        [accountId, now],
      );
      const [cache] = await connection.execute<RowDataPacket[]>(
        "SELECT * FROM research_cache WHERE account_id=? AND dataset=? AND request_hash=?",
        [accountId, dataset, key],
      );
      if (cache.length) {
        try {
          if (
            Number(cache[0].stored_at) > now ||
            Number(cache[0].expires_at) >
              Math.min(
                Number(cache[0].stored_at) + feedPolicy.cache.ttlSeconds * 1000,
                Date.parse(policy.expiresAt),
                Date.parse(feedPolicy.expiresAt),
                Date.parse(access.expiresAt),
              ) ||
            feedPolicy.cache.ttlSeconds === 0 ||
            !feedPolicy.cache.backupsApproved ||
            Number(cache[0].bytes) >
              Math.min(policy.maxCacheBytes, feedPolicy.cache.maxBytes) ||
            Buffer.byteLength(cache[0].payload) !== Number(cache[0].bytes) ||
            hash(cache[0].payload) !== cache[0].checksum
          )
            throw Error();
          const history = validatedCachedHistory(
            plan,
            JSON.parse(cache[0].payload),
          );
          await connection.execute(
            "UPDATE research_cache SET last_read=? WHERE account_id=? AND dataset=? AND request_hash=?",
            [now, accountId, dataset, key],
          );
          return {
            kind: "cached",
            history,
            storedAt: Number(cache[0].stored_at),
            expiresAt: Number(cache[0].expires_at),
          };
        } catch {
          await connection.execute(
            "DELETE FROM research_cache WHERE account_id=? AND dataset=? AND request_hash=?",
            [accountId, dataset, key],
          );
          return reject("INVALID_CACHE");
        }
      }
      if (Number(account.cooldown_until) > now)
        return reject(
          "LIMITED",
          Math.ceil((Number(account.cooldown_until) - now) / 1000),
        );
      const [leases] = await connection.execute<RowDataPacket[]>(
        "SELECT dataset,request_hash,expires_at FROM research_leases WHERE account_id=?",
        [accountId],
      );
      if (
        leases.some(
          (row) => row.dataset === dataset && row.request_hash === key,
        )
      )
        return reject("BUSY", 1);
      if (
        leases.length >= policy.maxConcurrent ||
        leases.filter((row) => row.dataset === dataset).length >=
          feedPolicy.maxConcurrent
      )
        return reject("BUSY", 1);
      const rootMinute = budgetWindow(
          now,
          Number(account.minute_window),
          60_000,
        ),
        rootDay = budgetWindow(now, Number(account.day_window), 86_400_000);
      const feedMinute = budgetWindow(now, Number(feed.minute_window), 60_000),
        feedDay = budgetWindow(now, Number(feed.day_window), 86_400_000);
      const rm =
          rootMinute.window === Number(account.minute_window)
            ? Number(account.minute_used)
            : 0,
        rd =
          rootDay.window === Number(account.day_window)
            ? Number(account.day_used)
            : 0;
      const fm =
          feedMinute.window === Number(feed.minute_window)
            ? Number(feed.minute_used)
            : 0,
        fd =
          feedDay.window === Number(feed.day_window)
            ? Number(feed.day_used)
            : 0;
      const cost = feedPolicy.requestCredits;
      for (const [used, limit, window] of [
        [rm, policy.minuteCredits, rootMinute],
        [rd, policy.dayCredits, rootDay],
        [fm, feedPolicy.minuteCredits, feedMinute],
        [fd, feedPolicy.dayCredits, feedDay],
      ] as const) {
        if (used + cost > limit)
          return reject("LIMITED", window.retryAfterSeconds);
      }
      await connection.execute(
        "UPDATE research_accounts SET minute_window=?,minute_used=?,day_window=?,day_used=? WHERE account_id=?",
        [rootMinute.window, rm + cost, rootDay.window, rd + cost, accountId],
      );
      await connection.execute(
        "UPDATE research_feeds SET minute_window=?,minute_used=?,day_window=?,day_used=? WHERE account_id=? AND dataset=?",
        [
          feedMinute.window,
          fm + cost,
          feedDay.window,
          fd + cost,
          accountId,
          dataset,
        ],
      );
      const lease: ResearchLease = {
        accountId,
        requestHash: key,
        token: randomUUID(),
        accountGeneration: String(account.generation),
        feedGeneration: String(feed.generation),
        plan,
        access,
      };
      await connection.execute(
        "INSERT INTO research_leases VALUES(?,?,?,?,?,?,?)",
        [
          accountId,
          dataset,
          key,
          lease.token,
          lease.accountGeneration,
          lease.feedGeneration,
          now + feedPolicy.leaseMs,
        ],
      );
      return { kind: "lease", lease };
    });
    if (result.kind === "rejected") throw result.fault;
    return result;
  }
  private async currentLease(context: Context, lease: ResearchLease) {
    const [rows] = await context.connection.execute<RowDataPacket[]>(
      "SELECT * FROM research_leases WHERE account_id=? AND dataset=? AND request_hash=?",
      [lease.accountId, dataset, lease.requestHash],
    );
    return rows[0]?.token === lease.token &&
      String(rows[0].account_generation) ===
        String(context.account.generation) &&
      String(rows[0].feed_generation) === String(context.feed.generation) &&
      String(context.account.generation) === lease.accountGeneration &&
      String(context.feed.generation) === lease.feedGeneration
      ? rows[0]
      : undefined;
  }
  async complete(lease: ResearchLease, input: unknown) {
    return this.accountTransaction(lease.accountId, async (context) => {
      const { connection, policy, feedPolicy, now } = context;
      const plan = authorizedHistoryPlan(
        lease.plan,
        lease.access,
        new Date(now).toISOString(),
      );
      const current = await this.currentLease(context, lease);
      if (
        !current ||
        Number(current.expires_at) <= now ||
        historyRequestKey(plan, lease.access, new Date(now).toISOString()) !==
          lease.requestHash
      )
        throw new CoordinationFault("STALE_LEASE");
      if (!this.allowed(context, plan)) throw new CoordinationFault("DISABLED");
      const history = validatedCachedHistory(plan, input);
      if (feedPolicy.cache.ttlSeconds > 0) {
        const [maintenance] = await connection.query<RowDataPacket[]>(
          "SELECT @@event_scheduler AS scheduler,(SELECT STATUS FROM information_schema.EVENTS WHERE EVENT_SCHEMA=DATABASE() AND EVENT_NAME='research_cache_expiry') AS status",
        );
        if (
          maintenance[0].scheduler !== "ON" ||
          maintenance[0].status !== "ENABLED"
        )
          throw new CoordinationFault("UNAVAILABLE");
      }
      if (Date.parse(history.observedAt) > now + 2000)
        throw new HistoryFault("INVALID_DATA");
      const payload = JSON.stringify(history),
        bytes = Buffer.byteLength(payload);
      let stored = false;
      const expiresAt = Math.min(
        now + feedPolicy.cache.ttlSeconds * 1000,
        Date.parse(policy.expiresAt),
        Date.parse(feedPolicy.expiresAt),
        Date.parse(lease.access.expiresAt),
      );
      if (
        feedPolicy.cache.ttlSeconds > 0 &&
        feedPolicy.cache.backupsApproved &&
        expiresAt > now &&
        bytes <=
          Math.min(262144, policy.maxCacheBytes, feedPolicy.cache.maxBytes) &&
        policy.maxCacheEntries > 0
      ) {
        await connection.execute(
          "DELETE FROM research_cache WHERE account_id=? AND expires_at<=?",
          [lease.accountId, now],
        );
        const [rows] = await connection.execute<RowDataPacket[]>(
          "SELECT dataset,request_hash,bytes FROM research_cache WHERE account_id=? ORDER BY last_read,request_hash",
          [lease.accountId],
        );
        while (
          rows.length >= policy.maxCacheEntries ||
          rows.reduce((n, r) => n + Number(r.bytes), 0) + bytes >
            policy.maxCacheBytes ||
          rows.filter((r) => r.dataset === dataset).length >=
            feedPolicy.cache.maxEntries ||
          rows
            .filter((r) => r.dataset === dataset)
            .reduce((n, r) => n + Number(r.bytes), 0) +
            bytes >
            feedPolicy.cache.maxBytes
        ) {
          const feedFull =
            rows.filter((r) => r.dataset === dataset).length >=
              feedPolicy.cache.maxEntries ||
            rows
              .filter((r) => r.dataset === dataset)
              .reduce((n, r) => n + Number(r.bytes), 0) +
              bytes >
              feedPolicy.cache.maxBytes;
          const index = feedFull
            ? rows.findIndex((r) => r.dataset === dataset)
            : 0;
          const victim = rows.splice(index, 1)[0];
          if (!victim) throw new CoordinationFault("UNAVAILABLE");
          await connection.execute(
            "DELETE FROM research_cache WHERE account_id=? AND dataset=? AND request_hash=?",
            [lease.accountId, victim.dataset, victim.request_hash],
          );
        }
        await connection.execute(
          "INSERT INTO research_cache VALUES(?,?,?,?,?,?,?,?,?)",
          [
            lease.accountId,
            dataset,
            lease.requestHash,
            payload,
            hash(payload),
            bytes,
            now,
            expiresAt,
            now,
          ],
        );
        stored = true;
      }
      await connection.execute(
        "DELETE FROM research_leases WHERE account_id=? AND dataset=? AND request_hash=? AND token=?",
        [lease.accountId, dataset, lease.requestHash, lease.token],
      );
      return {
        history,
        stored,
        storedAt: stored ? now : null,
        expiresAt: stored ? expiresAt : null,
      };
    });
  }
  async fail(lease: ResearchLease, error: unknown) {
    await this.accountTransaction(lease.accountId, async (context) => {
      if (!(await this.currentLease(context, lease))) return;
      if (error instanceof HistoryFault && error.code === "THROTTLED") {
        const delay =
          Math.max(1, Math.min(3600, error.retryAfterSeconds || 60)) * 1000;
        await context.connection.execute(
          "UPDATE research_accounts SET cooldown_until=GREATEST(cooldown_until,?) WHERE account_id=?",
          [context.now + delay, lease.accountId],
        );
      }
      if (error instanceof HistoryFault && error.code === "DENIED") {
        await context.connection.execute(
          "UPDATE research_accounts SET blocked=true,generation=generation+1 WHERE account_id=?",
          [lease.accountId],
        );
        await context.connection.execute(
          "DELETE FROM research_cache WHERE account_id=?",
          [lease.accountId],
        );
        await context.connection.execute(
          "DELETE FROM research_leases WHERE account_id=?",
          [lease.accountId],
        );
      } else
        await context.connection.execute(
          "DELETE FROM research_leases WHERE account_id=? AND dataset=? AND request_hash=? AND token=?",
          [lease.accountId, dataset, lease.requestHash, lease.token],
        );
      // A network attempt is never refunded, including timeout/process death.
    });
  }
  async sweep(accountId: string) {
    await this.accountTransaction(
      accountId,
      async ({ connection, now, policy, feedPolicy, account }) => {
        const revoke =
          Number(account.blocked) ||
          !reviewCurrent(policy, now) ||
          !reviewCurrent(feedPolicy, now);
        await connection.execute(
          `DELETE FROM research_cache WHERE account_id=?${revoke ? "" : " AND expires_at<=?"}`,
          revoke ? [accountId] : [accountId, now],
        );
        await connection.execute(
          `DELETE FROM research_leases WHERE account_id=?${revoke ? "" : " AND expires_at<=?"}`,
          revoke ? [accountId] : [accountId, now],
        );
      },
    );
  }
}
