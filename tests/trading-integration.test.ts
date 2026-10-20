import { before, beforeEach, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import type { RowDataPacket } from "mysql2/promise";
import { getPool, closePool, createAccount } from "@tradecrafters/database";
import {
  issueTrainingQuote,
  issueFxQuote,
  submitOrder,
  convertFx,
  resetAccount,
  operationByKey,
  portfolio,
  activity,
  type Actor,
} from "@tradecrafters/database/trading";
import { policyHash } from "../packages/database/src/policies";
import { fixtureSql } from "./fixtures/mysql-operator";
import {
  trainingScenario,
  type OrderIntent,
  type OperationResult,
} from "@tradecrafters/domain/trading";
import type { CurrencyCode } from "@tradecrafters/domain";
const base = process.env.BETTER_AUTH_URL || "http://127.0.0.1:3000";
const users: string[] = [];
type Trader = { id: string; cookie: string; accountId: string; actor: Actor };
let trader: Trader;
async function post(
  path: string,
  body: unknown,
  cookie = "",
  key?: string,
  origin = base,
) {
  return fetch(base + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      Cookie: cookie,
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    body: JSON.stringify(body),
  });
}
async function member(code: CurrencyCode = "USD"): Promise<Trader> {
  const response = await fetch(base + "/api/auth/sign-up/email", {
    method: "POST",
    headers: {
      Origin: base,
      "Content-Type": "application/json",
      "X-Forwarded-For": `2001:db8:${randomUUID().slice(0, 4)}:${randomUUID().slice(0, 4)}::1`,
    },
    body: JSON.stringify({
      name: "Trading fixture",
      email: `m2-${randomUUID()}@example.test`,
      password: randomUUID() + randomUUID(),
    }),
  });
  assert.equal(response.status, 200, "isolated local sign-up should succeed");
  const result = await response.json(),
    id = String(result.user.id);
  users.push(id);
  const cookie = response.headers
    .getSetCookie()
    .find((value) => value.includes("session_token="))!
    .split(";")[0];
  const account = await createAccount(id, code);
  const [sessions] = await getPool().execute<RowDataPacket[]>(
    "SELECT id FROM session WHERE userId=? ORDER BY createdAt DESC LIMIT 1",
    [id],
  );
  return {
    id,
    cookie,
    accountId: account!.id,
    actor: { userId: id, sessionId: sessions[0].id },
  };
}
async function intent(
  owner = trader,
  listingId = "sim-xnas-kite",
  quantity = 1,
  side: "BUY" | "SELL" = "BUY",
): Promise<OrderIntent> {
  const { quote } = await issueTrainingQuote(
    owner.id,
    owner.accountId,
    listingId,
  );
  return {
    accountId: owner.accountId,
    quoteId: quote.id,
    listingId,
    side,
    orderType: "MARKET",
    quantity,
  };
}
const filled = (result: OperationResult) => {
  assert.equal(result.receipt.status, "filled");
  if (result.receipt.status !== "filled") throw Error("Expected fill");
  return result.receipt.order;
};
async function counts(accountId = trader.accountId) {
  const [rows] = await getPool().execute<RowDataPacket[]>(
    "SELECT (SELECT COUNT(*) FROM orders WHERE account_id=?) AS orders,(SELECT COUNT(*) FROM operation_records WHERE account_id=?) AS operations,(SELECT COUNT(*) FROM cash_journals WHERE account_id=?) AS journals,(SELECT COUNT(*) FROM positions WHERE account_id=?) AS positions",
    [accountId, accountId, accountId, accountId],
  );
  return Object.fromEntries(
    Object.entries(rows[0]).map(([k, v]) => [k, Number(v)]),
  );
}
async function reconcile(accountId = trader.accountId) {
  const [journals] = await getPool().execute<RowDataPacket[]>(
    "SELECT j.id,SUM(e.amount_minor) AS net,COUNT(*) AS count FROM cash_journals j JOIN cash_entries e ON e.journal_id=j.id WHERE j.account_id=? GROUP BY j.id",
    [accountId],
  );
  for (const journal of journals) {
    assert.equal(BigInt(journal.net), 0n);
    assert.equal(Number(journal.count), 2);
  }
  const [wallets] = await getPool().execute<RowDataPacket[]>(
    "SELECT w.currency,w.balance_minor,COALESCE(SUM(e.amount_minor),0) AS posted FROM wallets w LEFT JOIN cash_journals j ON j.account_id=w.account_id AND j.currency=w.currency LEFT JOIN cash_entries e ON e.journal_id=j.id AND e.bucket='wallet' WHERE w.account_id=? GROUP BY w.currency,w.balance_minor",
    [accountId],
  );
  for (const wallet of wallets)
    assert.equal(BigInt(wallet.balance_minor), BigInt(wallet.posted));
  const [fills] = await getPool().execute<RowDataPacket[]>(
    "SELECT f.definition FROM fills f JOIN orders o ON o.id=f.order_id WHERE o.account_id=?",
    [accountId],
  );
  const expected = new Map<
    string,
    { quantity: bigint; basis: bigint; realized: bigint }
  >();
  for (const row of fills) {
    const fill = row.definition,
      old = expected.get(fill.listingId) ?? {
        quantity: 0n,
        basis: 0n,
        realized: 0n,
      };
    old.quantity += BigInt(fill.quantity) * (fill.side === "BUY" ? 1n : -1n);
    old.basis +=
      fill.side === "BUY"
        ? BigInt(fill.notionalMinor)
        : -BigInt(fill.allocatedBasisMinor);
    old.realized += BigInt(fill.realizedMinor);
    expected.set(fill.listingId, old);
  }
  const [positions] = await getPool().execute<RowDataPacket[]>(
    "SELECT listing_id,quantity,cost_basis_minor,realized_minor FROM positions WHERE account_id=?",
    [accountId],
  );
  assert.equal(positions.length, expected.size);
  for (const position of positions)
    assert.deepEqual(
      {
        quantity: BigInt(position.quantity),
        basis: BigInt(position.cost_basis_minor),
        realized: BigInt(position.realized_minor),
      },
      expected.get(position.listing_id),
    );
}
before(() => {
  assert.equal(process.env.AUTH_DEV_CREDENTIALS, "true");
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
  assert.ok(
    ["localhost", "127.0.0.1", "mysql"].includes(
      new URL(process.env.DATABASE_URL!).hostname,
    ),
  );
});
beforeEach(async () => {
  trader = await member();
});
after(async () => {
  try {
    for (const user of users) {
      const [accounts] = await getPool().execute<RowDataPacket[]>(
        "SELECT id FROM simulation_accounts WHERE user_id=?",
        [user],
      );
      for (const account of accounts) {
        const id = account.id;
        await getPool().execute(
          "DELETE r FROM account_resets r JOIN simulation_accounts a ON a.id=r.old_account_id WHERE a.user_id=?",
          [user],
        );
        await getPool().execute(
          "DELETE f FROM fills f JOIN orders o ON o.id=f.order_id WHERE o.account_id=?",
          [id],
        );
        for (const table of [
          "fx_conversions",
          "orders",
          "positions",
          "operation_records",
          "market_snapshots",
          "fx_quotes",
        ])
          await getPool().execute(`DELETE FROM ${table} WHERE account_id=?`, [
            id,
          ]);
        await getPool().execute(
          "DELETE e FROM cash_entries e JOIN cash_journals j ON j.id=e.journal_id WHERE j.account_id=?",
          [id],
        );
        await getPool().execute(
          "DELETE FROM cash_journals WHERE account_id=?",
          [id],
        );
        await getPool().execute("DELETE FROM wallets WHERE account_id=?", [id]);
      }
      await getPool().execute(
        "DELETE FROM simulation_accounts WHERE user_id=?",
        [user],
      );
      await getPool().execute("DELETE FROM mutation_budgets WHERE user_id=?", [
        user,
      ]);
      await getPool().execute("DELETE FROM user WHERE id=?", [user]);
    }
  } finally {
    await closePool();
  }
});
test("HTTP trading boundaries reject anonymous, foreign-owned, cross-origin and forged price/clock intents", async () => {
  const body = await intent();
  assert.equal(
    (await post("/api/trading/orders", body, "", randomUUID())).status,
    401,
  );
  assert.equal(
    (
      await post(
        "/api/trading/orders",
        body,
        trader.cookie,
        randomUUID(),
        "https://example.test",
      )
    ).status,
    403,
  );
  assert.equal(
    (await post("/api/trading/orders", body, trader.cookie)).status,
    400,
  );
  for (const extra of [
    { executionPrice: "1" },
    { userId: "forged" },
    { clock: "2026-01-01" },
    { quantity: "1" },
  ])
    assert.equal(
      (
        await post(
          "/api/trading/orders",
          { ...body, ...extra },
          trader.cookie,
          randomUUID(),
        )
      ).status,
      400,
    );
  const other = await member();
  assert.equal(
    (await post("/api/trading/orders", body, other.cookie, randomUUID()))
      .status,
    404,
  );
  assert.equal(
    (
      await fetch(
        `${base}/api/trading/portfolio?accountId=${trader.accountId}`,
        { headers: { Cookie: other.cookie } },
      )
    ).status,
    404,
  );
  assert.deepEqual(await counts(), {
    orders: 0,
    operations: 0,
    journals: 1,
    positions: 0,
  });
});
test("native buy, partial sales and final liquidation reconcile exact cash, basis and immutable provenance", async () => {
  const buy = filled(
    await submitOrder(
      trader.actor,
      randomUUID(),
      await intent(trader, "sim-xnas-kite", 3),
    ),
  );
  assert.equal(buy.price, "184.42");
  assert.equal(buy.notionalMinor, "55326");
  assert.equal(buy.feesMinor, "0");
  assert.equal(buy.scenario, trainingScenario);
  assert.equal(buy.quoteUnit, "USD");
  assert.ok(
    buy.snapshotId && buy.policyId && buy.marketAt && buy.reportingFx.version,
  );
  let realized = 0n;
  for (let i = 0; i < 3; i++) {
    const sell = filled(
      await submitOrder(
        trader.actor,
        randomUUID(),
        await intent(trader, "sim-xnas-kite", 1, "SELL"),
      ),
    );
    realized += BigInt(sell.realizedMinor);
  }
  const result = await portfolio(trader.id, trader.accountId),
    position = result.positions[0];
  assert.equal(position.quantity, "0");
  assert.equal(position.basisMinor, "0");
  assert.equal(BigInt(position.realizedMinor), realized);
  assert.equal(BigInt(result.wallets[0].balanceMinor), 10000000n + realized);
  assert.equal(result.reporting.netPnlMinor, realized.toString());
  await reconcile();
});
test("eight concurrent identical submissions create one durable fill and changed bodies conflict", async () => {
  const body = await intent(),
    key = randomUUID();
  const results = await Promise.all(
    Array.from({ length: 8 }, () => submitOrder(trader.actor, key, body)),
  );
  for (const result of results) assert.deepEqual(result, results[0]);
  assert.deepEqual(await counts(), {
    orders: 1,
    operations: 1,
    journals: 2,
    positions: 1,
  });
  await assert.rejects(
    submitOrder(trader.actor, key, { ...body, quantity: 2 }),
    /different operation/,
  );
  assert.deepEqual(
    await operationByKey(trader.id, trader.accountId, key),
    results[0],
  );
  await reconcile();
});
test("concurrent affordable-looking buys cannot overspend the same native wallet", async () => {
  const body = await intent(trader, "sim-xnas-kite", 400);
  const results = await Promise.all([
    submitOrder(trader.actor, randomUUID(), body),
    submitOrder(trader.actor, randomUUID(), body),
  ]);
  assert.equal(
    results.filter((result) => result.receipt.status === "filled").length,
    1,
  );
  assert.equal(
    results.filter((result) => result.receipt.status === "rejected").length,
    1,
  );
  const result = await portfolio(trader.id, trader.accountId);
  assert.equal(result.positions[0].quantity, "400");
  assert.equal(result.wallets[0].balanceMinor, "2623200");
  await reconcile();
});
test("first-position races and concurrent sales cannot duplicate inventory or oversell", async () => {
  const buy = await intent();
  await Promise.all(
    Array.from({ length: 5 }, () =>
      submitOrder(trader.actor, randomUUID(), buy),
    ),
  );
  const sell = await intent(trader, "sim-xnas-kite", 1, "SELL");
  const results = await Promise.all(
    Array.from({ length: 10 }, () =>
      submitOrder(trader.actor, randomUUID(), sell),
    ),
  );
  assert.equal(
    results.filter((result) => result.receipt.status === "filled").length,
    5,
  );
  assert.equal(
    results.filter((result) => result.receipt.status === "rejected").length,
    5,
  );
  const result = await portfolio(trader.id, trader.accountId);
  assert.equal(result.positions.length, 1);
  assert.equal(result.positions[0].quantity, "0");
  assert.equal(result.positions[0].basisMinor, "0");
  await reconcile();
});
test("explicit FX creates one linked pair of balanced journals, no grants and no duplicate conversion", async () => {
  const quote = await issueFxQuote(trader.id, trader.accountId, "USD", "JPY");
  const body = {
      accountId: trader.accountId,
      quoteId: quote.id,
      sourceMinor: "600000",
    },
    key = randomUUID();
  const results = await Promise.all(
    Array.from({ length: 6 }, () => convertFx(trader.actor, key, body)),
  );
  for (const result of results) assert.deepEqual(result, results[0]);
  assert.equal(results[0].receipt.status, "converted");
  const result = await portfolio(trader.id, trader.accountId);
  assert.equal(
    result.wallets.find((w) => w.currency === "JPY")!.balanceMinor,
    "900000",
  );
  assert.equal(
    result.wallets.find((w) => w.currency === "USD")!.balanceMinor,
    "9400000",
  );
  assert.equal(result.reporting.equityMinor, "10000000");
  filled(
    await submitOrder(
      trader.actor,
      randomUUID(),
      await intent(trader, "sim-xtks-hikari", 100),
    ),
  );
  await reconcile();
  const [rows] = await getPool().execute<RowDataPacket[]>(
    "SELECT COUNT(*) AS count FROM fx_conversions WHERE account_id=?",
    [trader.accountId],
  );
  assert.equal(Number(rows[0].count), 1);
});
test("JPY/KWD exponents and GBP pence settle in native units without implicit conversion", async () => {
  const missing = await submitOrder(
    trader.actor,
    randomUUID(),
    await intent(trader, "sim-xlon-atlas"),
  );
  assert.equal(missing.receipt.status, "rejected");
  const fx = await issueFxQuote(trader.id, trader.accountId, "USD", "GBP");
  await convertFx(trader.actor, randomUUID(), {
    accountId: trader.accountId,
    quoteId: fx.id,
    sourceMinor: "10000",
  });
  const uk = filled(
    await submitOrder(
      trader.actor,
      randomUUID(),
      await intent(trader, "sim-xlon-atlas"),
    ),
  );
  assert.equal(uk.quoteUnit, "GBX");
  assert.equal(uk.notionalMinor, "1249");
  await reconcile();
  const kw = await member("KWD");
  const pearl = filled(
    await submitOrder(
      kw.actor,
      randomUUID(),
      await intent(kw, "sim-xkuw-pearl", 100),
    ),
  );
  assert.equal(pearl.notionalMinor, "74700");
  await reconcile(kw.accountId);
  const jp = await member("JPY");
  const hikari = filled(
    await submitOrder(
      jp.actor,
      randomUUID(),
      await intent(jp, "sim-xtks-hikari", 100),
    ),
  );
  assert.equal(hikari.notionalMinor, "842500");
  await reconcile(jp.accountId);
});
test("stale/future/corrupt quotes fail closed and rejection retries retain their original outcome", async () => {
  for (const mode of ["stale", "future", "corrupt"]) {
    const body = await intent();
    const [rows] = await getPool().execute<RowDataPacket[]>(
      "SELECT definition FROM market_snapshots WHERE id=?",
      [body.quoteId],
    );
    const quote = rows[0].definition;
    if (mode === "corrupt") quote.reference = "1.00";
    else {
      const observed = new Date(
        Date.now() + (mode === "future" ? 10000 : -40000),
      );
      quote.observedAt = observed.toISOString();
      quote.expiresAt = new Date(observed.getTime() + 30000).toISOString();
    }
    await getPool().execute(
      "UPDATE market_snapshots SET definition=?,content_hash=?,observed_at=?,expires_at=? WHERE id=?",
      [
        JSON.stringify(quote),
        mode === "corrupt" ? "0".repeat(64) : policyHash(quote),
        new Date(quote.observedAt),
        new Date(quote.expiresAt),
        body.quoteId,
      ],
    );
    const key = randomUUID(),
      result = await submitOrder(trader.actor, key, body);
    assert.equal(result.receipt.status, "rejected");
    assert.deepEqual(await submitOrder(trader.actor, key, body), result);
  }
  assert.equal((await counts()).orders, 0);
  await reconcile();
});
test("a discarded HTTP response recovers the identical committed receipt and ownership protects it", async () => {
  const body = await intent(),
    key = randomUUID();
  const response = await post("/api/trading/orders", body, trader.cookie, key);
  assert.equal(response.status, 201);
  await response.arrayBuffer();
  const recovered = await fetch(
    `${base}/api/trading/operations?accountId=${trader.accountId}&key=${key}`,
    { headers: { Cookie: trader.cookie } },
  );
  assert.equal(recovered.status, 200);
  const saved = await recovered.json();
  const retry = await post("/api/trading/orders", body, trader.cookie, key);
  assert.equal(retry.status, 201);
  assert.deepEqual(await retry.json(), saved);
  const other = await member();
  assert.equal(
    (
      await fetch(
        `${base}/api/trading/operations?accountId=${trader.accountId}&key=${key}`,
        { headers: { Cookie: other.cookie } },
      )
    ).status,
    404,
  );
  assert.equal((await counts()).orders, 1);
});
test("a SQL failure after wallet/position/journal writes rolls everything back and the same key can retry", async () => {
  const body = await intent(),
    key = randomUUID(),
    trigger = `tc_fault_${randomUUID().replaceAll("-", "")}`;
  fixtureSql(
    `CREATE TRIGGER ${trigger} BEFORE INSERT ON fills FOR EACH ROW BEGIN IF EXISTS(SELECT 1 FROM orders WHERE id=NEW.order_id AND account_id='${trader.accountId}') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixture failure'; END IF; END`,
  );
  try {
    await assert.rejects(submitOrder(trader.actor, key, body));
    assert.deepEqual(await counts(), {
      orders: 0,
      operations: 0,
      journals: 1,
      positions: 0,
    });
    assert.equal(
      (await portfolio(trader.id, trader.accountId)).wallets[0].balanceMinor,
      "10000000",
    );
  } finally {
    fixtureSql(`DROP TRIGGER IF EXISTS ${trigger}`);
  }
  filled(await submitOrder(trader.actor, key, body));
  await reconcile();
});
test("process death before commit releases the transaction with no partial accounting and permits same-key recovery", async () => {
  const body = await intent(),
    key = randomUUID(),
    lock = `tc_crash_${randomUUID()}`,
    trigger = `tc_crash_${randomUUID().replaceAll("-", "")}`;
  const blocker = await getPool().getConnection();
  await blocker.query("SELECT GET_LOCK(?,5)", [lock]);
  fixtureSql(
    `CREATE TRIGGER ${trigger} BEFORE INSERT ON fills FOR EACH ROW BEGIN IF EXISTS(SELECT 1 FROM orders WHERE id=NEW.order_id AND account_id='${trader.accountId}') THEN SET @fixture_lock=GET_LOCK('${lock}',15); END IF; END`,
  );
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      "--env-file=.env.local",
      "tests/fixtures/crash-trade.ts",
    ],
    { cwd: process.cwd(), stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
  );
  child.stdout.resume();
  child.stderr.resume();
  child.stdin.end(JSON.stringify({ actor: trader.actor, key, intent: body }));
  let blocked = false;
  try {
    for (let i = 0; i < 80; i++) {
      const pending = fixtureSql(
        `SELECT COUNT(*) FROM performance_schema.metadata_locks WHERE OBJECT_TYPE='USER LEVEL LOCK' AND OBJECT_NAME='${lock}' AND LOCK_STATUS='PENDING'`,
      );
      if (Number(pending) > 0) {
        blocked = true;
        break;
      }
      await delay(100);
    }
    assert.equal(
      blocked,
      true,
      "owned child must reach the pre-commit barrier",
    );
    const ended = once(child, "exit");
    child.kill("SIGKILL");
    await ended;
  } finally {
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGKILL");
    await blocker.query("SELECT RELEASE_LOCK(?)", [lock]);
    blocker.release();
    fixtureSql(`DROP TRIGGER IF EXISTS ${trigger}`);
  }
  assert.deepEqual(await counts(), {
    orders: 0,
    operations: 0,
    journals: 1,
    positions: 0,
  });
  filled(await submitOrder(trader.actor, key, body));
  await reconcile();
});
test("reset and order races archive history, preserve receipts and create exactly one new grant", async () => {
  const body = await intent(),
    resetKey = randomUUID(),
    orderKey = randomUUID();
  const [reset, order] = await Promise.all([
    resetAccount(trader.actor, resetKey, {
      accountId: trader.accountId,
      confirmation: "RESET",
    }),
    submitOrder(trader.actor, orderKey, body),
  ]);
  assert.equal(reset.receipt.status, "reset");
  if (reset.receipt.status !== "reset") throw Error();
  assert.deepEqual(await submitOrder(trader.actor, orderKey, body), order);
  assert.deepEqual(
    await resetAccount(trader.actor, resetKey, {
      accountId: trader.accountId,
      confirmation: "RESET",
    }),
    reset,
  );
  const next = reset.receipt.nextAccountId,
    old = await portfolio(trader.id, trader.accountId),
    fresh = await portfolio(trader.id, next);
  assert.equal(old.state, "archived");
  assert.equal(fresh.state, "active");
  assert.equal(fresh.wallets[0].balanceMinor, "10000000");
  assert.equal(fresh.positions.length, 0);
  const denied = await resetAccount(trader.actor, randomUUID(), {
    accountId: next,
    confirmation: "RESET",
  });
  assert.equal(denied.httpStatus, 429);
  const [rows] = await getPool().execute<RowDataPacket[]>(
    "SELECT COUNT(*) AS count FROM simulation_accounts WHERE user_id=? AND state='active'",
    [trader.id],
  );
  assert.equal(Number(rows[0].count), 1);
  await reconcile();
  await reconcile(next);
});
test("concurrent FX and buy operations cannot each spend the same available cash", async () => {
  const body = await intent(trader, "sim-xnas-kite", 400),
    quote = await issueFxQuote(trader.id, trader.accountId, "USD", "EUR");
  const results = await Promise.all([
    submitOrder(trader.actor, randomUUID(), body),
    convertFx(trader.actor, randomUUID(), {
      accountId: trader.accountId,
      quoteId: quote.id,
      sourceMinor: "8000000",
    }),
  ]);
  assert.equal(
    results.filter((result) => result.receipt.status !== "rejected").length,
    1,
  );
  await reconcile();
});

test("an FX posting failure rolls back both wallets and both currency journals", async () => {
  const quote = await issueFxQuote(trader.id, trader.accountId, "USD", "KWD"),
    body = {
      accountId: trader.accountId,
      quoteId: quote.id,
      sourceMinor: "10000",
    },
    key = randomUUID(),
    trigger = `tc_fx_${randomUUID().replaceAll("-", "")}`;
  fixtureSql(
    `CREATE TRIGGER ${trigger} BEFORE INSERT ON fx_conversions FOR EACH ROW BEGIN IF NEW.account_id='${trader.accountId}' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixture failure'; END IF; END`,
  );
  try {
    await assert.rejects(convertFx(trader.actor, key, body));
    assert.deepEqual(await counts(), {
      orders: 0,
      operations: 0,
      journals: 1,
      positions: 0,
    });
    const current = await portfolio(trader.id, trader.accountId);
    assert.equal(current.wallets.length, 1);
    assert.equal(current.wallets[0].balanceMinor, "10000000");
  } finally {
    fixtureSql(`DROP TRIGGER IF EXISTS ${trigger}`);
  }
  assert.equal(
    (await convertFx(trader.actor, key, body)).receipt.status,
    "converted",
  );
  await reconcile();
});
test("FX expiry, account binding and provider/rate provenance cannot be bypassed", async () => {
  const other = await member();
  const quote = await issueFxQuote(trader.id, trader.accountId, "USD", "GBP");
  const foreign = await convertFx(other.actor, randomUUID(), {
    accountId: other.accountId,
    quoteId: quote.id,
    sourceMinor: "10000",
  });
  assert.equal(foreign.receipt.status, "rejected");
  const changed = { ...quote, rateNumerator: "1000000" };
  await getPool().execute(
    "UPDATE fx_quotes SET definition=?,content_hash=? WHERE id=?",
    [JSON.stringify(changed), policyHash(changed), quote.id],
  );
  const tampered = await convertFx(trader.actor, randomUUID(), {
    accountId: trader.accountId,
    quoteId: quote.id,
    sourceMinor: "10000",
  });
  assert.equal(tampered.receipt.status, "rejected");
  const expired = {
    ...quote,
    observedAt: new Date(Date.now() - 120000).toISOString(),
    effectiveFrom: new Date(Date.now() - 120000).toISOString(),
    expiresAt: new Date(Date.now() - 60000).toISOString(),
  };
  await getPool().execute(
    "UPDATE fx_quotes SET definition=?,content_hash=?,observed_at=?,expires_at=? WHERE id=?",
    [
      JSON.stringify(expired),
      policyHash(expired),
      new Date(expired.observedAt),
      new Date(expired.expiresAt),
      quote.id,
    ],
  );
  assert.equal(
    (
      await convertFx(trader.actor, randomUUID(), {
        accountId: trader.accountId,
        quoteId: quote.id,
        sourceMinor: "10000",
      })
    ).receipt.status,
    "rejected",
  );
  await reconcile();
  await reconcile(other.accountId);
});
test("quotes that expire while the account lock is held never post a trade or conversion", async () => {
  for (const kind of ["order", "fx"] as const) {
    const body =
      kind === "order"
        ? await intent()
        : {
            accountId: trader.accountId,
            quoteId: (
              await issueFxQuote(trader.id, trader.accountId, "USD", "GBP")
            ).id,
            sourceMinor: "10000",
          };
    const table = kind === "order" ? "market_snapshots" : "fx_quotes";
    const [rows] = await getPool().execute<RowDataPacket[]>(
      `SELECT definition FROM ${table} WHERE id=?`,
      [body.quoteId],
    );
    const quote = rows[0].definition;
    quote.expiresAt = new Date(Date.now() + 400).toISOString();
    await getPool().execute(
      `UPDATE ${table} SET definition=?,content_hash=?,expires_at=? WHERE id=?`,
      [
        JSON.stringify(quote),
        policyHash(quote),
        new Date(quote.expiresAt),
        body.quoteId,
      ],
    );
    const blocker = await getPool().getConnection();
    await blocker.beginTransaction();
    await blocker.execute(
      "SELECT id FROM simulation_accounts WHERE id=? FOR UPDATE",
      [trader.accountId],
    );
    const pending =
      kind === "order"
        ? submitOrder(trader.actor, randomUUID(), body as OrderIntent)
        : convertFx(
            trader.actor,
            randomUUID(),
            body as { accountId: string; quoteId: string; sourceMinor: string },
          );
    try {
      await delay(600);
      await blocker.rollback();
      const result = await pending;
      assert.equal(result.receipt.status, "rejected");
    } finally {
      await blocker.rollback();
      blocker.release();
    }
  }
  assert.deepEqual(await counts(), {
    orders: 0,
    operations: 2,
    journals: 1,
    positions: 0,
  });
  await reconcile();
});
test("an unavailable position mark makes reporting equity incomplete rather than silently zero", async () => {
  const id = `m2-unavailable-${randomUUID()}`;
  await getPool().execute(
    "INSERT INTO securities (id,name,fictional) VALUES (?,'Disposable unavailable fixture',true)",
    [id],
  );
  try {
    await getPool().execute(
      "INSERT INTO listings (id,security_id,mic,symbol,settlement_currency,quote_unit,unit_numerator,unit_denominator,timezone,fixture_policy) VALUES (?,?,'ZZZZ',?,'USD','USD',1,1,'Etc/UTC',JSON_OBJECT())",
      [id, id, id.slice(-20)],
    );
    await getPool().execute(
      "INSERT INTO positions (account_id,listing_id,currency,quantity,cost_basis_minor) VALUES (?,?,'USD',1,0)",
      [trader.accountId, id],
    );
    const value = await portfolio(trader.id, trader.accountId);
    assert.equal(value.positions[0].valueMinor, null);
    assert.equal(value.wallets[0].balanceMinor, "10000000");
    assert.equal(value.reporting.complete, false);
    assert.equal(value.reporting.equityMinor, null);
    assert.equal(value.reporting.netPnlMinor, null);
  } finally {
    await getPool().execute(
      "DELETE FROM positions WHERE account_id=? AND listing_id=?",
      [trader.accountId, id],
    );
    await getPool().execute("DELETE FROM listings WHERE id=?", [id]);
    await getPool().execute("DELETE FROM securities WHERE id=?", [id]);
  }
});
test("revoked sessions cannot mutate even through a previously validated service actor", async () => {
  const body = await intent();
  await getPool().execute("DELETE FROM session WHERE id=? AND userId=?", [
    trader.actor.sessionId,
    trader.id,
  ]);
  await assert.rejects(
    submitOrder(trader.actor, randomUUID(), body),
    /Sign in again/,
  );
  assert.equal((await counts()).orders, 0);
});
test("receipt pagination is stable, bounded and cannot use another account's cursor", async () => {
  const body = await intent();
  for (let i = 0; i < 23; i++)
    await submitOrder(trader.actor, randomUUID(), body);
  const first = await activity(trader.id, trader.accountId);
  assert.equal(first.receipts.length, 20);
  assert.ok(first.nextCursor);
  const next = await activity(trader.id, trader.accountId, first.nextCursor!);
  assert.equal(next.receipts.length, 3);
  assert.equal(next.nextCursor, null);
  assert.equal(
    new Set([...first.receipts, ...next.receipts].map((row) => row.id)).size,
    23,
  );
  const other = await member();
  await assert.rejects(
    activity(other.id, other.accountId, first.nextCursor!),
    /not found/,
  );
  await reconcile();
});
