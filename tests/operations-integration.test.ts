import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getPool, closePool } from "@tradecrafters/database";
import { databaseUnavailable } from "@tradecrafters/database/pool";
import { api } from "../apps/web/src/lib/api";
import { confirmSignOut } from "../apps/web/src/lib/sign-out";
import { getAuth } from "@tradecrafters/database/auth";
import { GET as health } from "../apps/web/src/app/api/health/route";
after(closePool);

async function signOutFixture() {
  assert.equal(process.env.AUTH_DEV_CREDENTIALS, "true");
  assert.ok(
    ["localhost", "127.0.0.1"].includes(
      new URL(process.env.DATABASE_URL!).hostname,
    ),
  );
  const base = process.env.BETTER_AUTH_URL || "http://127.0.0.1:3000";
  const email = `signout-fixture-${randomUUID()}@example.invalid`;
  const network = `2001:db8:${randomUUID().slice(0, 4)}:1::1`;
  const context = await getAuth().$context;
  const signedUp = await getAuth().handler(
    new Request(base + "/api/auth/sign-up/email", {
      method: "POST",
      headers: {
        Origin: base,
        "Content-Type": "application/json",
        "X-Forwarded-For": network,
      },
      body: JSON.stringify({
        email,
        name: "Disposable sign-out fixture",
        password: randomUUID() + randomUUID(),
      }),
    }),
  );
  assert.ok(signedUp.ok);
  const id = (await signedUp.json()).user.id;
  const cookie = signedUp.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const request = () =>
    new Request(base + "/api/auth/sign-out", {
      method: "POST",
      headers: {
        Origin: base,
        Cookie: cookie,
        "Content-Type": "application/json",
        "X-Forwarded-For": network,
      },
      body: "{}",
    });
  const invoke = () => {
    const input = request();
    return api(
      () => confirmSignOut(input, () => getAuth().handler(input.clone())),
      input,
    );
  };
  const lookup = () =>
    getAuth().api.getSession({
      headers: new Headers({ Cookie: cookie }),
      query: { disableCookieCache: true, disableRefresh: true },
    });
  const cleanup = async () => {
    const [accounts] = await getPool().execute<
      import("mysql2/promise").RowDataPacket[]
    >("SELECT COUNT(*) AS total FROM simulation_accounts WHERE user_id=?", [
      id,
    ]);
    assert.equal(Number(accounts[0].total), 0);
    await getPool().execute("DELETE FROM user WHERE id=? AND email=?", [
      id,
      email,
    ]);
    await getPool().execute("DELETE FROM rateLimit WHERE `key` LIKE ?", [
      `%${network.split(":").slice(0, 4).join(":")}%`,
    ]);
  };
  return { context, invoke, lookup, cleanup };
}

test("a sign-out deletion fault cannot report success or clear cookies, and a retry confirms revocation", async () => {
  const fixture = await signOutFixture(),
    original = fixture.context.internalAdapter.deleteSession;
  try {
    fixture.context.internalAdapter.deleteSession = async () => {
      throw Error("fixture-only deletion failure");
    };
    const rejected = await fixture.invoke();
    assert.equal(rejected.status, 503);
    assert.equal(rejected.headers.get("Retry-After"), "1");
    assert.equal(rejected.headers.get("Cache-Control"), "no-store");
    assert.equal(rejected.headers.getSetCookie().length, 0);
    assert.equal((await rejected.json()).error.code, "SERVICE_UNAVAILABLE");
    assert.ok(await fixture.lookup());
    fixture.context.internalAdapter.deleteSession = original;
    const recovered = await fixture.invoke();
    assert.equal(recovered.status, 200);
    assert.ok(
      recovered.headers
        .getSetCookie()
        .some((c) => c.includes("session_token=")),
    );
    assert.equal(await fixture.lookup(), null);
  } finally {
    fixture.context.internalAdapter.deleteSession = original;
    await fixture.cleanup();
  }
});

test("sign-out confirmation fails closed before an unreadable session and recovers after a committed deletion loses its confirmation", async () => {
  const fixture = await signOutFixture(),
    adapter = fixture.context.internalAdapter;
  const find = adapter.findSession,
    remove = adapter.deleteSession;
  try {
    adapter.findSession = async () => {
      throw Error("fixture-only lookup failure");
    };
    const rejected = await fixture.invoke();
    assert.equal(rejected.status, 503);
    assert.equal(rejected.headers.getSetCookie().length, 0);
    adapter.findSession = find;
    assert.ok(await fixture.lookup());
    let committed = false;
    adapter.deleteSession = async (...args) => {
      await remove(...args);
      committed = true;
    };
    adapter.findSession = async (...args) => {
      if (committed) throw Error("fixture-only confirmation loss");
      return find(...args);
    };
    const uncertain = await fixture.invoke();
    assert.equal(committed, true);
    assert.equal(uncertain.status, 503);
    assert.equal(uncertain.headers.getSetCookie().length, 0);
    adapter.findSession = find;
    adapter.deleteSession = remove;
    assert.equal(await fixture.lookup(), null);
    assert.equal((await fixture.invoke()).status, 200);
  } finally {
    adapter.findSession = find;
    adapter.deleteSession = remove;
    await fixture.cleanup();
  }
});

test("serverless pools retain checked-out work, drain idle sockets before suspension and reconnect", async () => {
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [
      "--import",
      "tsx",
      "--env-file=.env.local",
      "tests/fixtures/pool-lifecycle.ts",
    ],
    { cwd: process.cwd(), windowsHide: true, timeout: 30000 },
  );
  assert.match(stdout, /Pool lifecycle verified/);
});
test("a saturated MySQL pool rejects a burst through promise and auth callback paths, then recovers", async () => {
  const pool = getPool();
  const held = [];
  try {
    for (let i = 0; i < Number(process.env.MYSQL_POOL_SIZE || 5); i++)
      held.push(await pool.getConnection());
    const start = performance.now();
    const outcomes = await Promise.allSettled(
      Array.from({ length: 40 }, (_, i) =>
        i % 3 === 0
          ? pool.query("SELECT 1")
          : i % 3 === 1
            ? pool.execute("SELECT 1")
            : pool.getConnection(),
      ),
    );
    assert.ok(
      performance.now() - start < 4000,
      "capacity rejection must not wait for held connections",
    );
    assert.ok(
      outcomes.every(
        (outcome) =>
          outcome.status === "rejected" && databaseUnavailable(outcome.reason),
      ),
    );
    await new Promise<void>((resolve, reject) =>
      pool.pool.getConnection((error, connection) => {
        if (connection) {
          connection.release();
          reject(Error("saturated callback acquired a connection"));
        } else if (databaseUnavailable(error)) resolve();
        else reject(Error("unexpected callback outcome"));
      }),
    );
    const response = await api(async () => {
      await pool.query("SELECT 1");
      return Response.json({ unexpected: true });
    }, new Request("http://127.0.0.1:3000/api/directory"));
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("Retry-After"), "1");
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal((await response.json()).error.code, "SERVICE_UNAVAILABLE");
    assert.equal((await health().json()).status, "ok");
  } finally {
    for (const connection of held) connection.release();
  }
  const [rows] = await pool.query("SELECT 1 AS recovered");
  assert.ok(rows);
  const recovered = await Promise.all(
    Array.from({ length: Number(process.env.MYSQL_POOL_SIZE || 5) }, () =>
      pool.getConnection(),
    ),
  );
  recovered.forEach((connection) => connection.release());
});
test("HTTP liveness is database-free and discloses no configuration", async () => {
  const response = await fetch(
    (process.env.BETTER_AUTH_URL || "http://127.0.0.1:3000") + "/api/health",
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await response.json(), { status: "ok" });
});

test("API admission preserves SDK cookies, redirects and bodies while making every response non-storable", async () => {
  const request = new Request("http://127.0.0.1:3000/api/auth/get-session");
  const source = Response.json(
    { fixture: true },
    {
      status: 201,
      headers: { "Cache-Control": "public, max-age=3600", Vary: "Cookie" },
    },
  );
  source.headers.append(
    "Set-Cookie",
    "fixture_a=one; Path=/; HttpOnly; Secure; SameSite=Lax",
  );
  source.headers.append(
    "Set-Cookie",
    "fixture_b=two; Path=/; HttpOnly; Secure; SameSite=Lax",
  );
  const expectedCookies = source.headers.getSetCookie();
  const response = await api(async () => source, request);
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("Vary"), "Cookie");
  assert.deepEqual(response.headers.getSetCookie(), expectedCookies);
  assert.deepEqual(await response.json(), { fixture: true });
  // Response.redirect has immutable headers; mutating it in place would fail.
  const redirected = await api(
    async () => Response.redirect("http://127.0.0.1:3000/sign-in", 307),
    request,
  );
  assert.equal(redirected.status, 307);
  assert.equal(
    redirected.headers.get("Location"),
    "http://127.0.0.1:3000/sign-in",
  );
  assert.equal(redirected.headers.get("Cache-Control"), "no-store");
  const base = process.env.BETTER_AUTH_URL || "http://127.0.0.1:3000";
  for (const path of [
    "/api/auth/get-session",
    "/api/auth/list-sessions",
    "/api/auth/callback/github?code=fixture-code&state=forged-fixture-state",
  ]) {
    const actual = await fetch(base + path, { redirect: "manual" });
    assert.ok([200, 302, 401].includes(actual.status));
    assert.equal(actual.headers.get("Cache-Control"), "no-store");
    await actual.arrayBuffer();
  }
});

test("an acquisition timeout never executes its queued SQL after a connection becomes available", async () => {
  const pool = getPool(),
    held = [],
    lock = `tc-deadline-${randomUUID()}`;
  try {
    for (let i = 0; i < Number(process.env.MYSQL_POOL_SIZE || 5); i++)
      held.push(await pool.getConnection());
    await assert.rejects(
      pool.query("SELECT GET_LOCK(?,0)", [lock]),
      (error: unknown) =>
        error instanceof Error &&
        "code" in error &&
        error.code === "DB_ACQUIRE_TIMEOUT",
    );
  } finally {
    held.forEach((connection) => connection.release());
  }
  const [rows] = await pool.query<import("mysql2/promise").RowDataPacket[]>(
    "SELECT IS_USED_LOCK(?) AS owner",
    [lock],
  );
  assert.equal(
    rows[0].owner,
    null,
    "expired caller SQL must never run on a late connection",
  );
});
