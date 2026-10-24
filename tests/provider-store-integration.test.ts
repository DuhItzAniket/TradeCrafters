import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { fork } from "node:child_process";
import type { RowDataPacket } from "mysql2/promise";
import {
  createResearchPool,
  initializeResearchStore,
  ResearchStore,
  type ResearchLease,
} from "../packages/database/src/provider-store";
import {
  CoordinationFault,
  type AccountPolicy,
  type FeedPolicy,
} from "../packages/domain/src/provider-coordination";
import {
  HistoryFault,
  normalizeDailyHistory,
  type HistoryPlan,
} from "../packages/domain/src/provider-history";
import { coordinatedDailyHistory } from "../scripts/market-data/history-service";

const url = new URL(process.env.PROVIDER_DATABASE_URL || "");
assert.equal(process.env.PROVIDER_FIXTURE, "true");
assert.equal(url.hostname, "127.0.0.1");
assert.match(url.pathname, /^\/tc_provider_[a-f0-9]{24}$/);
const base = process.env.HISTORY_SIMULATION_URL!;
assert.match(base, /^http:\/\/127\.0\.0\.1:\d+$/);
const pool = createResearchPool(),
  otherPool = createResearchPool(),
  store = new ResearchStore(pool),
  other = new ResearchStore(otherPool);
let review: {
  enabled: boolean;
  reviewedAt: string;
  expiresAt: string;
  evidenceRef: string;
};
before(async () => {
  await initializeResearchStore(pool);
  await initializeResearchStore(pool);
  const [clock] = await pool.query<RowDataPacket[]>(
    "SELECT FLOOR(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000) AS ms",
  );
  const now = Number(clock[0].ms);
  review = {
    enabled: true,
    reviewedAt: new Date(now - 60_000).toISOString(),
    expiresAt: new Date(now + 86_400_000).toISOString(),
    evidenceRef: "fixture-only-private-review",
  };
});
after(async () => {
  await otherPool.end();
  await pool.end();
});
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const fault = (code: string) => (error: unknown) =>
  error instanceof CoordinationFault && error.code === code;
const plan = (symbol = "FIX_US"): HistoryPlan => ({
  provider: "twelvedata",
  listingId: "fixture-us",
  symbol,
  mic: "XNAS",
  providerExchange: "NASDAQ",
  providerCurrency: "USD",
  quoteCurrency: "USD",
  settlementCurrency: "USD",
  quoteUnitDenominator: "1",
  timezone: "America/New_York",
  from: "2026-10-01",
  to: "2026-10-02",
  mappingEvidenceRef: "fixture-mapping-only",
});
const access = (p: HistoryPlan) => ({
  provider: p.provider,
  purpose: "private_research",
  dataset: "daily_history",
  status: "approved",
  listingIds: [p.listingId],
  reviewedAt: review.reviewedAt,
  expiresAt: review.expiresAt,
  evidenceRef: "fixture-access-only",
});
const accountPolicy = (change: Partial<AccountPolicy> = {}): AccountPolicy => ({
  provider: "twelvedata",
  ...review,
  resetBasis: "UTC_fixed_windows",
  minuteCredits: 100,
  dayCredits: 100,
  maxConcurrent: 8,
  maxCacheEntries: 8,
  maxCacheBytes: 32768,
  ...change,
});
const feedPolicy = (change: Partial<FeedPolicy> = {}): FeedPolicy => ({
  dataset: "daily_history",
  ...review,
  listingIds: ["fixture-us"],
  minuteCredits: 100,
  dayCredits: 100,
  requestCredits: 1,
  maxConcurrent: 8,
  leaseMs: 15000,
  cache: {
    ttlSeconds: 0,
    maxEntries: 0,
    maxBytes: 0,
    backupsApproved: false,
    evidenceRef: "fixture-no-price-storage",
  },
  ...change,
});
const cache = (ttlSeconds = 60) => ({
  ttlSeconds,
  maxEntries: 8,
  maxBytes: 32768,
  backupsApproved: true,
  evidenceRef: "fixture-storage-and-backup-only",
});
async function setup(
  a: Partial<AccountPolicy> = {},
  f: Partial<FeedPolicy> = {},
) {
  const id = "fixture_" + randomUUID().replace(/-/g, "").slice(0, 16);
  await store.configureAccount(id, accountPolicy(a));
  await store.configureFeed(id, feedPolicy(f));
  return id;
}
async function lease(id: string, p = plan(), s = store) {
  const reservation = await s.reserve(id, p, access(p));
  assert.equal(reservation.kind, "lease");
  return reservation.lease;
}
function history(p: HistoryPlan) {
  return normalizeDailyHistory(
    p,
    JSON.stringify({
      status: "ok",
      meta: {
        symbol: p.symbol,
        interval: "1day",
        currency: p.providerCurrency,
        exchange_timezone: p.timezone,
        exchange: p.providerExchange,
        mic_code: p.mic,
        type: "Common Stock",
      },
      values: [
        {
          datetime: "2026-10-01",
          open: "9007199254740993.1",
          high: "9007199254740994",
          low: "9007199254740992",
          close: "9007199254740993.12345678901",
          volume: "9007199254740993",
        },
      ],
    }),
    new Date().toISOString(),
  );
}
async function used(id: string) {
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT minute_used,day_used,cooldown_until,blocked FROM research_accounts WHERE account_id=?",
    [id],
  );
  return rows[0];
}
async function release(l: ResearchLease) {
  await store.fail(l, new HistoryFault("UPSTREAM_FAILURE"));
}

test("dedicated provider identity cannot read application tables and schema initialization is repeatable", async () => {
  const [tables] = await pool.query<RowDataPacket[]>("SHOW TABLES");
  assert.equal(tables.length, 5);
  await assert.rejects(
    () => pool.query("SELECT 1 FROM tradecrafters_v2.`user` LIMIT 0"),
    (error: unknown) =>
      Boolean(
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ER_TABLEACCESS_DENIED_ERROR",
      ),
  );
});
test("independent MySQL pools atomically share account credits and rejected calls spend nothing", async () => {
  const id = await setup({ minuteCredits: 5 }, { requestCredits: 2 });
  const outcomes: PromiseSettledResult<
    Awaited<ReturnType<typeof store.reserve>>
  >[] = [];
  for (let start = 0; start < 8; start += 4)
    outcomes.push(
      ...(await Promise.allSettled(
        Array.from({ length: 4 }, (_, i) =>
          (i % 2 ? other : store).reserve(
            id,
            plan("FIX_" + (start + i)),
            access(plan()),
          ),
        ),
      )),
    );
  const wins = outcomes.filter((x) => x.status === "fulfilled");
  assert.equal(wins.length, 2);
  assert.ok(
    outcomes
      .filter((x) => x.status === "rejected")
      .every((x) => fault("LIMITED")(x.reason)),
  );
  assert.equal(Number((await used(id)).minute_used), 4);
  for (const result of wins) {
    assert.equal(result.value.kind, "lease");
    await release(result.value.lease);
  }
  assert.equal(Number((await used(id)).minute_used), 4);
});
test("feed daily ceiling, database-window rollover and backwards-clock counters fail closed", async () => {
  const id = await setup({}, { dayCredits: 1 });
  const first = await lease(id);
  await release(first);
  await assert.rejects(
    () => store.reserve(id, plan("FIX_NEXT"), access(plan())),
    fault("LIMITED"),
  );
  await store.configureFeed(id, feedPolicy({ dayCredits: 2 }));
  await release(await lease(id, plan("FIX_NEXT")));
  assert.equal(Number((await used(id)).day_used), 2);
  await pool.execute(
    "UPDATE research_accounts SET minute_window=FLOOR(UNIX_TIMESTAMP()/60)-1,minute_used=100,day_window=FLOOR(UNIX_TIMESTAMP()/86400)-1,day_used=100 WHERE account_id=?",
    [id],
  );
  await pool.execute(
    "UPDATE research_feeds SET minute_window=FLOOR(UNIX_TIMESTAMP()/60)-1,minute_used=100,day_window=FLOOR(UNIX_TIMESTAMP()/86400)-1,day_used=100 WHERE account_id=?",
    [id],
  );
  await release(await lease(id, plan("FIX_ROLLOVER")));
  assert.equal(Number((await used(id)).day_used), 1);
  await pool.execute(
    "UPDATE research_accounts SET minute_window=FLOOR(UNIX_TIMESTAMP()/60)+1,minute_used=100 WHERE account_id=?",
    [id],
  );
  await assert.rejects(
    () => store.reserve(id, plan(), access(plan())),
    fault("LIMITED"),
  );
});
test("same-request followers share one lease and fresh cache hits do not spend or restamp", async () => {
  const id = await setup({}, { cache: cache() });
  const results = await Promise.allSettled([
    store.reserve(id, plan(), access(plan())),
    other.reserve(id, plan(), access(plan())),
  ]);
  const win = results.find((x) => x.status === "fulfilled");
  assert.ok(win && win.status === "fulfilled" && win.value.kind === "lease");
  assert.equal(
    results.filter((x) => x.status === "rejected" && fault("BUSY")(x.reason))
      .length,
    1,
  );
  const value = history(plan());
  await store.complete(win.value.lease, value);
  const cached = await other.reserve(id, plan(), access(plan()));
  assert.equal(cached.kind, "cached");
  assert.equal(cached.history.observedAt, value.observedAt);
  assert.equal(cached.history.bars[0].close, value.bars[0].close);
  assert.equal(cached.history.executionEligible, false);
  assert.equal(Number((await used(id)).minute_used), 1);
});
test("a killed producer leaves charged credits; expiry permits takeover and fences its late result", async () => {
  const id = await setup({}, { cache: cache() });
  const child = fork(
    new URL("./fixtures/provider-lease-owner.ts", import.meta.url),
    [],
    {
      execArgv: ["--import", "tsx"],
      silent: true,
      env: {
        ...process.env,
        PROVIDER_LEASE_FIXTURE: JSON.stringify({
          accountId: id,
          plan: plan(),
          access: access(plan()),
        }),
      },
    },
  );
  let old: ResearchLease;
  try {
    const reservation = await new Promise<{
      kind: string;
      lease: ResearchLease;
    }>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(Error("Fixture producer did not reserve.")),
        8000,
      );
      child.once("message", (message) => {
        clearTimeout(timer);
        resolve(message as { kind: string; lease: ResearchLease });
      });
      child.once("exit", () => {
        clearTimeout(timer);
        reject(Error("Fixture producer exited early."));
      });
    });
    assert.equal(reservation.kind, "lease");
    old = reservation.lease;
    const exited = new Promise((resolve) => child.once("exit", resolve));
    child.kill("SIGKILL");
    await exited;
  } finally {
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGKILL");
  }
  assert.equal(Number((await used(id)).minute_used), 1);
  await assert.rejects(
    () => other.reserve(id, plan(), access(plan())),
    fault("BUSY"),
  );
  await delay(15100);
  const replacement = await lease(id, plan(), other);
  await assert.rejects(
    () => store.complete(old!, history(plan())),
    fault("STALE_LEASE"),
  );
  await other.complete(replacement, history(plan()));
  assert.equal(Number((await used(id)).day_used), 2);
});
test("policy replacement revokes leases/cache without resetting already charged credits", async () => {
  const id = await setup({}, { cache: cache() });
  const first = await lease(id);
  await store.configureAccount(id, accountPolicy({ enabled: false }));
  await assert.rejects(
    () => store.complete(first, history(plan())),
    fault("STALE_LEASE"),
  );
  await assert.rejects(
    () => store.reserve(id, plan(), access(plan())),
    fault("DISABLED"),
  );
  await store.configureAccount(id, accountPolicy());
  const second = await lease(id);
  await store.complete(second, history(plan()));
  await store.configureFeed(id, feedPolicy({ enabled: false, cache: cache() }));
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT COUNT(*) AS n FROM research_cache WHERE account_id=?",
    [id],
  );
  assert.equal(Number(rows[0].n), 0);
  assert.equal(Number((await used(id)).day_used), 2);
});
test("cache entry/byte caps enforce eviction and no-store policies persist no price payload", async () => {
  const id = await setup(
    { maxCacheEntries: 2 },
    { cache: { ...cache(), maxEntries: 2 } },
  );
  for (let i = 0; i < 3; i++) {
    const p = plan("FIX_" + i);
    await store.complete(await lease(id, p), history(p));
    await delay(5);
  }
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT COUNT(*) AS n,SUM(bytes) AS bytes FROM research_cache WHERE account_id=?",
    [id],
  );
  assert.equal(Number(rows[0].n), 2);
  assert.ok(Number(rows[0].bytes) <= 32768);
  const replaced = await lease(id, plan("FIX_0"));
  await release(replaced);
  const noStore = await setup(
    { maxCacheBytes: 10 },
    { cache: { ...cache(), maxBytes: 10 } },
  );
  const result = await store.complete(await lease(noStore), history(plan()));
  assert.equal(result.stored, false);
  const none = await setup();
  assert.equal(
    (await store.complete(await lease(none), history(plan()))).stored,
    false,
  );
});
test("corrupt values or forged cached execution flags are rejected and removed durably", async () => {
  const id = await setup({}, { cache: cache() });
  await store.complete(await lease(id), history(plan()));
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT payload FROM research_cache WHERE account_id=?",
    [id],
  );
  const value = JSON.parse(rows[0].payload);
  value.executionEligible = true;
  const payload = JSON.stringify(value),
    checksum = createHash("sha256").update(payload).digest("hex");
  await pool.execute(
    "UPDATE research_cache SET payload=?,checksum=?,bytes=? WHERE account_id=?",
    [payload, checksum, Buffer.byteLength(payload), id],
  );
  await assert.rejects(
    () => store.reserve(id, plan(), access(plan())),
    fault("INVALID_CACHE"),
  );
  const [count] = await pool.execute<RowDataPacket[]>(
    "SELECT COUNT(*) AS n FROM research_cache WHERE account_id=?",
    [id],
  );
  assert.equal(Number(count[0].n), 0);
  assert.equal(Number((await used(id)).day_used), 1);
  await store.complete(await lease(id), history(plan()));
  await pool.execute(
    "UPDATE research_cache SET expires_at=expires_at+60000 WHERE account_id=?",
    [id],
  );
  await assert.rejects(
    () => store.reserve(id, plan(), access(plan())),
    fault("INVALID_CACHE"),
  );
});
test("idle SQL maintenance purges expired prices; disabled maintenance rejects caching", async () => {
  const id = await setup({}, { cache: cache(1) });
  await store.complete(await lease(id), history(plan()));
  const deadline = Date.now() + 16000;
  let remaining = 1;
  while (remaining && Date.now() < deadline) {
    await delay(300);
    const [rows] = await pool.execute<RowDataPacket[]>(
      "SELECT COUNT(*) AS n FROM research_cache WHERE account_id=?",
      [id],
    );
    remaining = Number(rows[0].n);
  }
  assert.equal(remaining, 0);
  await pool.query("ALTER EVENT research_cache_expiry DISABLE");
  try {
    await assert.rejects(
      () => store.reserve(id, plan(), access(plan())),
      fault("UNAVAILABLE"),
    );
  } finally {
    await pool.query("ALTER EVENT research_cache_expiry ENABLE");
  }
});
test("publication SQL failure rolls back cache eviction and never refunds the prior reservation", async () => {
  const id = await setup(
    { maxCacheEntries: 1 },
    { cache: { ...cache(), maxEntries: 1 } },
  );
  await store.complete(await lease(id), history(plan()));
  const next = plan("FIX_NEXT"),
    pending = await lease(id, next);
  assert.match(pending.requestHash, /^[a-f0-9]{64}$/);
  await pool.query(
    `ALTER TABLE research_cache ADD CONSTRAINT fixture_cache_failure CHECK (request_hash <> '${pending.requestHash}')`,
  );
  try {
    await assert.rejects(
      () => store.complete(pending, history(next)),
      fault("UNAVAILABLE"),
    );
  } finally {
    await pool.query(
      "ALTER TABLE research_cache DROP CHECK fixture_cache_failure",
    );
  }
  const cached = await store.reserve(id, plan(), access(plan()));
  assert.equal(cached.kind, "cached");
  assert.equal(Number((await used(id)).day_used), 2);
  await release(pending);
});
test("expiry of private access bounds cache lifetime and rejects reuse of previously cached data", async () => {
  const id = await setup({}, { cache: cache() });
  const permission = {
    ...access(plan()),
    expiresAt: new Date(Date.now() + 1500).toISOString(),
  };
  const reservation = await store.reserve(id, plan(), permission);
  assert.equal(reservation.kind, "lease");
  const result = await store.complete(reservation.lease, history(plan()));
  assert.ok(result.expiresAt! <= Date.parse(permission.expiresAt));
  await delay(1600);
  await assert.rejects(
    () => store.reserve(id, plan(), permission),
    (error: unknown) =>
      error instanceof HistoryFault &&
      error.code === "RESEARCH_ACCESS_REQUIRED",
  );
});
test("real HTTP through the coordinator fetches once, reuses SQL cache and rejects concurrent followers", async () => {
  const id = await setup({}, { cache: cache() }),
    p = plan();
  const options = {
    apiKey: "fixture-market-data-key",
    fixtureBaseUrl: base + "/twelve",
  };
  const first = await coordinatedDailyHistory(store, id, p, access(p), options);
  assert.equal(first.cacheHit, false);
  const second = await coordinatedDailyHistory(
    other,
    id,
    p,
    access(p),
    options,
  );
  assert.equal(second.cacheHit, true);
  assert.equal(second.history.observedAt, first.history.observedAt);
  const changed = await coordinatedDailyHistory(
    other,
    id,
    p,
    { ...access(p), evidenceRef: "fixture-new-private-review" },
    options,
  );
  assert.equal(changed.cacheHit, false);
  const slow = plan("FIX_SLOW"),
    running = coordinatedDailyHistory(store, id, slow, access(slow), options);
  const deadline = Date.now() + 4000;
  let acquired = false;
  while (!acquired && Date.now() < deadline) {
    const [rows] = await pool.execute<RowDataPacket[]>(
      "SELECT COUNT(*) AS n FROM research_leases WHERE account_id=?",
      [id],
    );
    acquired = Number(rows[0].n) > 0;
    if (!acquired) await delay(20);
  }
  assert.equal(acquired, true);
  await assert.rejects(
    () => coordinatedDailyHistory(other, id, slow, access(slow), options),
    fault("BUSY"),
  );
  await running;
  assert.equal(Number((await used(id)).day_used), 3);
});
test("real provider throttle/denial persists across workers while a separate provider stays usable", async () => {
  const options = {
    apiKey: "fixture-market-data-key",
    fixtureBaseUrl: base + "/twelve",
  };
  const limited = await setup(),
    p = plan("FIX_RATE");
  await assert.rejects(
    () => coordinatedDailyHistory(store, limited, p, access(p), options),
    (error: unknown) =>
      error instanceof HistoryFault && error.code === "THROTTLED",
  );
  await assert.rejects(
    () =>
      coordinatedDailyHistory(other, limited, plan(), access(plan()), options),
    fault("LIMITED"),
  );
  assert.equal(Number((await used(limited)).day_used), 1);
  const denied = await setup(),
    d = plan("FIX_DENIED");
  await assert.rejects(
    () => coordinatedDailyHistory(store, denied, d, access(d), options),
    (error: unknown) =>
      error instanceof HistoryFault && error.code === "DENIED",
  );
  await assert.rejects(
    () =>
      coordinatedDailyHistory(other, denied, plan(), access(plan()), options),
    fault("DISABLED"),
  );
  assert.equal(Number((await used(denied)).blocked), 1);
  const healthy = await setup({ provider: "eodhd" });
  const eod = {
    ...plan(),
    provider: "eodhd" as const,
    symbol: "FIX_US.US",
    providerExchange: "US",
  };
  const value = await coordinatedDailyHistory(
    other,
    healthy,
    eod,
    access(eod),
    { ...options, fixtureBaseUrl: base + "/eodhd" },
  );
  assert.equal(value.history.sourceScope, "composite");
  assert.equal(value.history.executionEligible, false);
});
test("an unavailable SQL gate prevents the coordinator from issuing an upstream request", async () => {
  const closed = createResearchPool(),
    unavailable = new ResearchStore(closed);
  await closed.end();
  await assert.rejects(
    () =>
      coordinatedDailyHistory(
        unavailable,
        "fixture_missing",
        plan(),
        access(plan()),
        { apiKey: "fixture-market-data-key", fixtureBaseUrl: base + "/twelve" },
      ),
    fault("UNAVAILABLE"),
  );
});
test("configuration limits the store to thirty-two trusted account records", async () => {
  const added: string[] = [];
  try {
    let [rows] = await pool.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS n FROM research_accounts",
    );
    while (Number(rows[0].n) < 32) {
      const id = "capacity_" + randomUUID().replace(/-/g, "").slice(0, 16);
      await store.configureAccount(id, accountPolicy({ enabled: false }));
      added.push(id);
      [rows] = await pool.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS n FROM research_accounts",
      );
    }
    await assert.rejects(
      () => store.configureAccount("capacity_overflow", accountPolicy()),
      fault("CONFIGURATION"),
    );
  } finally {
    for (const id of added)
      await pool.execute("DELETE FROM research_accounts WHERE account_id=?", [
        id,
      ]);
  }
});
