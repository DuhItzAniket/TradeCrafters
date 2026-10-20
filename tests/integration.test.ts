import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import {
  getPool,
  closePool,
  consumeMutationBudget,
} from "@tradecrafters/database";
import { authConfiguration } from "@tradecrafters/database/auth";
import { manageAdmin } from "@tradecrafters/database/security";

const base = process.env.BETTER_AUTH_URL || "http://127.0.0.1:3000";
const users: string[] = [];
type TestIdentity = {
  cookie: string;
  id: string;
  email: string;
  password: string;
};
let alice: TestIdentity;
let bob: TestIdentity;
let secondaryCookie = "";
let authenticatorSecret = "";
let recoveryCode = "";
let controlChanged = false;
let originalPaused = false;
function mergeCookies(current: string, response: Response) {
  const jar = new Map(
    current
      .split("; ")
      .filter(Boolean)
      .map((part) => [
        part.slice(0, part.indexOf("=")),
        part.slice(part.indexOf("=") + 1),
      ]),
  );
  for (const item of response.headers.getSetCookie()) {
    const part = item.split(";")[0];
    const equals = part.indexOf("=");
    const name = part.slice(0, equals);
    const value = part.slice(equals + 1);
    if (value) jar.set(name, value);
    else jar.delete(name);
  }
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}
function authenticatorCode() {
  // Decode the provisioning URI's Base32 key, then generate a standard RFC 6238 code.
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...authenticatorSecret.replace(/=+$/, "").toUpperCase()]
    .map((character) =>
      alphabet.indexOf(character).toString(2).padStart(5, "0"),
    )
    .join("");
  const key = Buffer.from(
    bits.match(/.{8}/g)!.map((byte) => Number.parseInt(byte, 2)),
  );
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(
    6,
    "0",
  );
}
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
  const email = `tc-${randomUUID()}@example.test`;
  const password = randomUUID() + randomUUID();
  const response = await post("/api/auth/sign-up/email", {
    name,
    email,
    password,
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
  return {
    cookie: setCookie.split(";")[0],
    id: String(result.user.id),
    email,
    password,
  };
}
before(async () => {
  assert.equal(
    process.env.AUTH_DEV_CREDENTIALS,
    "true",
    "integration tests require explicit localhost-only development credentials",
  );
  assert.ok(["127.0.0.1", "localhost"].includes(new URL(base).hostname));
  assert.ok(
    ["127.0.0.1", "localhost", "mysql"].includes(
      new URL(process.env.DATABASE_URL!).hostname,
    ),
    "integration checks require an isolated local database",
  );
  alice = await signup("Integration Alice");
  bob = await signup("Integration Bob");
  const [control] = await getPool().query<RowDataPacket[]>(
    "SELECT paused FROM simulation_control WHERE id = 1",
  );
  originalPaused = Boolean(control[0].paused);
});
after(async () => {
  // Remove only identities created by this run. Never truncate shared tables.
  const pool = getPool();
  try {
    if (controlChanged)
      await pool.execute(
        "UPDATE simulation_control SET paused = ? WHERE id = 1",
        [originalPaused],
      );
    for (const user of users) {
      await pool.execute(
        "DELETE FROM security_audit WHERE actor_user_id = ? OR subject_user_id = ?",
        [user, user],
      );
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
    if (previous.node === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous.node;
    if (previous.dev === undefined) delete process.env.AUTH_DEV_CREDENTIALS;
    else process.env.AUTH_DEV_CREDENTIALS = previous.dev;
  }
});

test("members cannot bootstrap admin access or forge a role through HTTP", async () => {
  await assert.rejects(
    manageAdmin(bob.id, "grant", "Integration verified bootstrap gate"),
    /verified identity/,
  );
  const response = await fetch(`${base}/api/admin/control`, {
    headers: { Cookie: bob.cookie, "X-Role": "admin" },
  });
  assert.equal(response.status, 403);
  assert.equal(
    (
      await post(
        "/api/admin/control",
        { paused: true, reason: "Forged admin attempt", role: "admin" },
        bob.cookie,
      )
    ).status,
    403,
  );
  const state = await (
    await fetch(`${base}/api/security`, { headers: { Cookie: bob.cookie } })
  ).json();
  assert.equal(state.isAdmin, false);
  assert.equal(state.mfaEnabled, false);
  assert.equal(state.hasPassword, true);
  // A verified identity alone must still have neither a role nor an admin bootstrap path.
  await getPool().execute("UPDATE user SET emailVerified = true WHERE id = ?", [
    bob.id,
  ]);
  try {
    assert.equal(
      (
        await fetch(`${base}/api/admin/control`, {
          headers: { Cookie: bob.cookie },
        })
      ).status,
      403,
    );
    await assert.rejects(
      manageAdmin(
        bob.id,
        "grant",
        "Integration verified member without factor",
      ),
      /verified identity/,
    );
  } finally {
    await getPool().execute(
      "UPDATE user SET emailVerified = false WHERE id = ?",
      [bob.id],
    );
  }
});
test("authenticator enrollment requires a correct code and rotates the setup session", async () => {
  const secondary = await post("/api/auth/sign-in/email", {
    email: bob.email,
    password: bob.password,
  });
  assert.equal(secondary.status, 200);
  secondaryCookie = mergeCookies("", secondary);
  const enable = await post(
    "/api/auth/two-factor/enable",
    { password: bob.password, method: "totp" },
    bob.cookie,
  );
  assert.equal(enable.status, 200);
  bob.cookie = mergeCookies(bob.cookie, enable);
  const enrollment = await enable.json();
  authenticatorSecret = new URL(enrollment.totpURI).searchParams.get("secret")!;
  recoveryCode = enrollment.backupCodes[0];
  assert.ok(authenticatorSecret && recoveryCode);
  const code = await authenticatorCode();
  const wrongCode = code === "000000" ? "999999" : "000000";
  assert.equal(
    (
      await post(
        "/api/auth/two-factor/verify-totp",
        { code: wrongCode },
        bob.cookie,
      )
    ).status,
    401,
  );
  const verify = await post(
    "/api/auth/two-factor/verify-totp",
    { code },
    bob.cookie,
  );
  assert.equal(verify.status, 200);
  const oldCookie = bob.cookie;
  bob.cookie = mergeCookies(bob.cookie, verify);
  assert.ok(
    bob.cookie !== oldCookie,
    "enrollment should rotate the setup session",
  );
  assert.equal(
    (await fetch(`${base}/api/security`, { headers: { Cookie: oldCookie } }))
      .status,
    401,
  );
  const state = await (
    await fetch(`${base}/api/security`, { headers: { Cookie: bob.cookie } })
  ).json();
  assert.equal(state.mfaEnabled, true);
  assert.equal(state.stepUpExpiresAt, null);
  assert.equal(
    (
      await post(
        "/api/auth/two-factor/disable",
        { password: bob.password },
        bob.cookie,
      )
    ).status,
    403,
  );
  await assert.rejects(
    manageAdmin(bob.id, "grant", "Integration unverified identity gate"),
    /verified identity/,
  );
});
test("an explicit admin grant still requires fresh per-session authenticator verification", async () => {
  // A privileged test fixture marks the email verified; no runtime bypass exists.
  await getPool().execute("UPDATE user SET emailVerified = true WHERE id = ?", [
    bob.id,
  ]);
  await manageAdmin(bob.id, "grant", "Integration test operator bootstrap");
  const locked = await fetch(`${base}/api/admin/control`, {
    headers: { Cookie: bob.cookie },
  });
  assert.equal(locked.status, 403);
  assert.equal((await locked.json()).error.code, "MFA_REQUIRED");
  const code = await authenticatorCode();
  assert.equal(
    (
      await post(
        "/api/security/verify",
        { code: code === "000000" ? "999999" : "000000" },
        bob.cookie,
      )
    ).status,
    401,
  );
  assert.equal(
    (await post("/api/security/verify", { code }, bob.cookie)).status,
    200,
  );
  assert.equal(
    (await post("/api/security/verify", { code }, bob.cookie)).status,
    409,
    "a consumed code cannot extend step-up access",
  );
  assert.equal(
    (
      await fetch(`${base}/api/admin/control`, {
        headers: { Cookie: bob.cookie },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await fetch(`${base}/api/admin/control`, {
        headers: { Cookie: secondaryCookie },
      })
    ).status,
    403,
    "proof on one session must not authorize another",
  );
});
test("admin pause is audited and blocks new grants, then resumes without minting extra money", async () => {
  controlChanged = true;
  const pause = await post(
    "/api/admin/control",
    { paused: true, reason: "Integration maintenance gate test" },
    bob.cookie,
  );
  assert.equal(pause.status, 200);
  const paused = await pause.json();
  assert.equal(paused.control.paused, true);
  assert.equal(paused.audit[0].action, "simulation_pause");
  const grant = await post(
    "/api/account",
    { reportingCurrency: "KWD" },
    bob.cookie,
  );
  assert.equal(grant.status, 503);
  assert.equal((await grant.json()).error.code, "SIMULATION_PAUSED");
  assert.equal(
    (
      await post(
        "/api/admin/control",
        { paused: false, reason: "Integration maintenance gate completed" },
        bob.cookie,
      )
    ).status,
    200,
  );
  const created = await post(
    "/api/account",
    { reportingCurrency: "KWD" },
    bob.cookie,
  );
  assert.equal(created.status, 201);
  assert.equal(
    (await created.json()).account.wallets[0].balanceMinor,
    "30000000",
  );
});
test("expired proof and revoked roles immediately deny privileged writes", async () => {
  const [sessions] = await getPool().execute<RowDataPacket[]>(
    "SELECT id FROM session WHERE userId = ? AND id IN (SELECT session_id FROM mfa_stepups)",
    [bob.id],
  );
  assert.equal(sessions.length, 1);
  await getPool().execute(
    "UPDATE mfa_stepups SET expires_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 SECOND) WHERE session_id = ?",
    [sessions[0].id],
  );
  assert.equal(
    (
      await fetch(`${base}/api/admin/control`, {
        headers: { Cookie: bob.cookie },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await post(
        "/api/admin/control",
        { paused: true, reason: "Expired proof must reject this write" },
        bob.cookie,
      )
    ).status,
    403,
  );
  await getPool().execute(
    "UPDATE session SET createdAt = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 11 MINUTE) WHERE id = ?",
    [sessions[0].id],
  );
  const stale = await post(
    "/api/auth/two-factor/disable",
    { password: bob.password },
    bob.cookie,
  );
  assert.equal(stale.status, 403);
  assert.equal((await stale.json()).error.code, "REAUTH_REQUIRED");
  await manageAdmin(
    bob.id,
    "revoke",
    "Integration test operator role revocation",
  );
  assert.equal(
    (
      await fetch(`${base}/api/admin/control`, {
        headers: { Cookie: bob.cookie },
      })
    ).status,
    403,
  );
});
test("local password sign-in requires a second factor and recovery codes are single use", async () => {
  await post("/api/auth/sign-out", {}, bob.cookie);
  const signin = await post("/api/auth/sign-in/email", {
    email: bob.email,
    password: bob.password,
  });
  assert.equal(signin.status, 200);
  assert.equal((await signin.json()).twoFactorRedirect, true);
  const pending = mergeCookies("", signin);
  assert.equal(
    (await fetch(`${base}/api/account`, { headers: { Cookie: pending } }))
      .status,
    401,
  );
  const recover = await post(
    "/api/auth/two-factor/verify-backup-code",
    { code: recoveryCode, trustDevice: false },
    pending,
  );
  assert.equal(recover.status, 200);
  const recoveredCookie = mergeCookies(pending, recover);
  bob.cookie = recoveredCookie;
  assert.equal(
    (
      await fetch(`${base}/api/account`, {
        headers: { Cookie: recoveredCookie },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await fetch(`${base}/api/admin/control`, {
        headers: { Cookie: recoveredCookie },
      })
    ).status,
    403,
  );
  const again = await post("/api/auth/sign-in/email", {
    email: bob.email,
    password: bob.password,
  });
  const reused = await post(
    "/api/auth/two-factor/verify-backup-code",
    { code: recoveryCode, trustDevice: false },
    mergeCookies("", again),
  );
  assert.equal(reused.status, 401);
});

test("authenticated authenticator attempts have a persistent per-user limit", async () => {
  await getPool().execute("DELETE FROM mfa_attempt_budgets WHERE user_id = ?", [
    bob.id,
  ]);
  const code = authenticatorCode() === "000000" ? "999999" : "000000";
  const statuses: number[] = [];
  for (let attempt = 0; attempt < 6; attempt++)
    statuses.push(
      (await post("/api/security/verify", { code }, bob.cookie)).status,
    );
  assert.equal(statuses[0], 401);
  assert.equal(statuses[5], 429);
});

test("disabling a factor clears privileged proofs across all user sessions", async () => {
  // Seed proofs only for this disposable identity to exercise the successful management path.
  await getPool().execute(
    "INSERT INTO mfa_stepups (session_id, expires_at) SELECT id, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 5 MINUTE) FROM session WHERE userId = ? ON DUPLICATE KEY UPDATE expires_at = VALUES(expires_at)",
    [bob.id],
  );
  const disabled = await post(
    "/api/auth/two-factor/disable",
    { password: bob.password },
    bob.cookie,
  );
  assert.equal(disabled.status, 200);
  const [remaining] = await getPool().execute<RowDataPacket[]>(
    "SELECT COUNT(*) AS count FROM mfa_stepups m JOIN session s ON s.id = m.session_id WHERE s.userId = ?",
    [bob.id],
  );
  assert.equal(Number(remaining[0].count), 0);
});
