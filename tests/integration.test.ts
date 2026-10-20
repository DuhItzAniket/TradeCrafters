import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import {
  getPool,
  closePool,
  consumeMutationBudget,
} from "@tradecrafters/database";
import { authConfiguration } from "@tradecrafters/database/auth";

const base = process.env.BETTER_AUTH_URL || "http://127.0.0.1:3000";
const users: string[] = [];
let alice: { cookie: string; id: string };
let bob: { cookie: string; id: string };
function post(path: string, body: unknown, cookie = "", origin = base) {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      Cookie: cookie,
    },
    body: JSON.stringify(body),
  });
}
async function signup(name: string) {
  const response = await post("/api/auth/sign-up/email", {
    name,
    email: `tc-${randomUUID()}@example.test`,
    password: randomUUID() + randomUUID(),
  });
  assert.equal(response.status, 200, "local test sign-up should succeed");
  const result = await response.json();
  users.push(result.user.id);
  const setCookie = response.headers
    .getSetCookie()
    .find((value) => value.includes("session_token="));
  assert.ok(setCookie, "sign-up should issue a session cookie");
  assert.match(setCookie, /httponly/i);
  assert.match(setCookie, /samesite=lax/i);
  return { cookie: setCookie.split(";")[0], id: String(result.user.id) };
}
before(async () => {
  assert.equal(
    process.env.AUTH_DEV_CREDENTIALS,
    "true",
    "integration tests require explicit localhost-only development credentials",
  );
  assert.ok(["127.0.0.1", "localhost"].includes(new URL(base).hostname));
  alice = await signup("Integration Alice");
  bob = await signup("Integration Bob");
});
after(async () => {
  // Remove only identities created by this run. Never truncate shared tables.
  const pool = getPool();
  try {
    for (const user of users) {
      const [accounts] = await pool.execute<RowDataPacket[]>(
        "SELECT id FROM simulation_accounts WHERE user_id = ?",
        [user],
      );
      for (const account of accounts) {
        await pool.execute(
          "DELETE e FROM cash_entries e JOIN cash_journals j ON e.journal_id = j.id WHERE j.account_id = ?",
          [account.id],
        );
        await pool.execute("DELETE FROM cash_journals WHERE account_id = ?", [
          account.id,
        ]);
        await pool.execute("DELETE FROM wallets WHERE account_id = ?", [
          account.id,
        ]);
      }
      await pool.execute("DELETE FROM simulation_accounts WHERE user_id = ?", [
        user,
      ]);
      await pool.execute("DELETE FROM mutation_budgets WHERE user_id = ?", [
        user,
      ]);
      await pool.execute("DELETE FROM user WHERE id = ?", [user]);
    }
  } finally {
    await closePool();
  }
});
test("anonymous and forged browser sessions cannot read or create an account", async () => {
  assert.equal((await fetch(`${base}/api/account`)).status, 401);
  assert.equal(
    (
      await fetch(`${base}/api/account`, {
        headers: {
          Cookie: "better-auth.session_token=forged",
          username: "Integration Alice",
        },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await post("/api/account", {
        reportingCurrency: "USD",
        username: "Integration Alice",
      })
    ).status,
    401,
  );
});
test("CSRF origin checks reject missing or foreign origins", async () => {
  assert.equal(
    (
      await post(
        "/api/account",
        { reportingCurrency: "JPY" },
        alice.cookie,
        "https://example.invalid",
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(`${base}/api/account`, {
        method: "POST",
        headers: { Cookie: alice.cookie, "Content-Type": "application/json" },
        body: "{}",
      })
    ).status,
    403,
  );
});
test("input contracts reject injected ownership, malformed JSON, large bodies and non-JSON", async () => {
  assert.equal(
    (
      await post(
        "/api/account",
        { reportingCurrency: "JPY", userId: bob.id },
        alice.cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (await post("/api/account", { reportingCurrency: "GBX" }, alice.cookie))
      .status,
    400,
  );
  assert.equal(
    (
      await fetch(`${base}/api/account`, {
        method: "POST",
        headers: {
          Cookie: alice.cookie,
          Origin: base,
          "Content-Type": "application/json",
        },
        body: "{",
      })
    ).status,
    400,
  );
  assert.equal(
    (await post("/api/account", { extra: "界".repeat(6000) }, alice.cookie))
      .status,
    413,
  );
  assert.equal(
    (
      await fetch(`${base}/api/account`, {
        method: "POST",
        headers: {
          Cookie: alice.cookie,
          Origin: base,
          "Content-Type": "text/plain",
        },
        body: "{}",
      })
    ).status,
    415,
  );
});
test("eight concurrent account requests issue exactly one grant and reconcile in native JPY", async () => {
  const responses = await Promise.all(
    Array.from({ length: 8 }, () =>
      post("/api/account", { reportingCurrency: "JPY" }, alice.cookie),
    ),
  );
  assert.ok(responses.every((response) => response.status === 201));
  const accounts = await Promise.all(
    responses.map((response) => response.json()),
  );
  assert.equal(new Set(accounts.map((result) => result.account.id)).size, 1);
  assert.equal(accounts[0].account.wallets[0].balanceMinor, "15000000");
  assert.equal(accounts[0].account.wallets[0].exponent, 0);
  const [rows] = await getPool().execute<RowDataPacket[]>(
    "SELECT COUNT(DISTINCT j.id) AS journals, SUM(e.amount_minor) AS net, COUNT(*) AS entries FROM cash_journals j JOIN cash_entries e ON e.journal_id = j.id JOIN simulation_accounts a ON a.id = j.account_id WHERE a.user_id = ?",
    [alice.id],
  );
  assert.equal(Number(rows[0].journals), 1);
  assert.equal(Number(rows[0].entries), 2);
  assert.equal(rows[0].net, "0");
});
test("adding and retrying a wallet leaves it empty and cannot issue another grant", async () => {
  const response = await post(
    "/api/wallets",
    { currency: "KWD" },
    alice.cookie,
  );
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(
    result.account.wallets.find(
      (wallet: { currency: string }) => wallet.currency === "KWD",
    ).balanceMinor,
    "0",
  );
  assert.equal(
    (await post("/api/wallets", { currency: "KWD" }, alice.cookie)).status,
    201,
  );
  const retry = await (
    await post("/api/account", { reportingCurrency: "USD" }, alice.cookie)
  ).json();
  assert.equal(retry.account.reportingCurrency, "JPY");
  assert.equal(retry.account.wallets.length, 2);
  assert.equal(
    retry.account.wallets.find(
      (wallet: { currency: string }) => wallet.currency === "JPY",
    ).balanceMinor,
    "15000000",
  );
});
test("another authenticated identity sees only its own account", async () => {
  const response = await fetch(`${base}/api/account`, {
    headers: { Cookie: bob.cookie, "X-User-Id": alice.id },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await response.json()).account, null);
  assert.equal(
    (await post("/api/wallets", { currency: "USD" }, bob.cookie)).status,
    409,
  );
});
test("SQL-backed worldwide search, parent identities and pagination retain the full snapshot", async () => {
  const result = await (await fetch(`${base}/api/directory`)).json();
  assert.equal(result.total, 2889);
  assert.equal(result.records.length, 30);
  assert.equal(result.source.changesEffectiveOn, "2026-10-26");
  const india = await (
    await fetch(`${base}/api/directory?country=IN&kind=SGMT`)
  ).json();
  assert.ok(india.records.length > 0);
  assert.ok(
    india.records.every(
      (row: { country: string; kind: string }) =>
        row.country === "IN" && row.kind === "SGMT",
    ),
  );
  const wildcard = await (
    await fetch(`${base}/api/directory?q=${encodeURIComponent("%")}`)
  ).json();
  assert.equal(wildcard.total, 0);
  const injection = await (
    await fetch(`${base}/api/directory?q=${encodeURIComponent("' OR 1=1 --")}`)
  ).json();
  assert.equal(injection.total, 0);
  assert.equal((await fetch(`${base}/api/directory?page=-1`)).status, 400);
  const [aliases] = await getPool().query<RowDataPacket[]>(
    "SELECT id, security_id FROM listings WHERE symbol = 'ATLS'",
  );
  assert.equal(aliases.length, 2);
  assert.notEqual(aliases[0].security_id, aliases[1].security_id);
});
test("database foreign keys/checks and default-deny real capabilities are enforced", async () => {
  const [constraints] = await getPool().query<RowDataPacket[]>(
    "SELECT COUNT(*) AS total FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME IN ('session','account')",
  );
  assert.equal(Number(constraints[0].total), 2);
  await assert.rejects(
    getPool().execute(
      "INSERT INTO wallets (account_id, currency, balance_minor) VALUES (?, 'USD', 0)",
      [randomUUID()],
    ),
  );
  const [caps] = await getPool().query<RowDataPacket[]>(
    "SELECT COUNT(*) AS total FROM venue_capabilities WHERE status <> 'unknown'",
  );
  assert.equal(Number(caps[0].total), 0);
  const [rates] = await getPool().query<RowDataPacket[]>(
    "SELECT COUNT(*) AS total FROM rateLimit",
  );
  assert.ok(
    Number(rates[0].total) > 0,
    "auth rate limits should persist in MySQL",
  );
});
test("mutation budgets persist across callers and are bounded under concurrency", async () => {
  const now = 2000000000000;
  const outcomes = await Promise.all(
    Array.from({ length: 24 }, () => consumeMutationBudget(bob.id, now)),
  );
  assert.ok(outcomes.some((allowed) => !allowed));
  const [rows] = await getPool().execute<RowDataPacket[]>(
    "SELECT hits FROM mutation_budgets WHERE user_id = ?",
    [bob.id],
  );
  assert.equal(Number(rows[0].hits), 24);
  assert.equal(await consumeMutationBudget(bob.id, now), false);
  assert.equal(await consumeMutationBudget(bob.id, now + 60000), true);
});
test("sign-out revokes the session in MySQL and a captured old cookie no longer works", async () => {
  assert.equal(
    (await post("/api/auth/sign-out", {}, alice.cookie)).status,
    200,
  );
  assert.equal(
    (await fetch(`${base}/api/account`, { headers: { Cookie: alice.cookie } }))
      .status,
    401,
  );
  const [rows] = await getPool().execute<RowDataPacket[]>(
    "SELECT COUNT(*) AS total FROM session WHERE userId = ?",
    [alice.id],
  );
  assert.equal(Number(rows[0].total), 0);
});
test("production cannot enable local password mode or start identity without OAuth", () => {
  const previous = {
    node: process.env.NODE_ENV,
    dev: process.env.AUTH_DEV_CREDENTIALS,
  };
  try {
    process.env.NODE_ENV = "production";
    assert.throws(() => authConfiguration(), /Development password/);
    process.env.AUTH_DEV_CREDENTIALS = "false";
    assert.throws(() => authConfiguration(), /HTTPS|GitHub/);
  } finally {
    process.env.NODE_ENV = previous.node;
    process.env.AUTH_DEV_CREDENTIALS = previous.dev;
  }
});
