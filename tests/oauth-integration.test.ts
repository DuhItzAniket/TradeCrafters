import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { getPool, closePool } from "@tradecrafters/database";
import { getAuth } from "@tradecrafters/database/auth";
const origin = "http://127.0.0.1:3099";
const email = `oauth-fixture-${randomUUID()}@example.test`;
const subject = 8000000000 + Number.parseInt(randomUUID().slice(0, 8), 16);
const names = [
  "NODE_ENV",
  "BETTER_AUTH_URL",
  "BETTER_AUTH_SECRET",
  "AUTH_DEV_CREDENTIALS",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
];
const saved = new Map(names.map((name) => [name, process.env[name]]));
const originalFetch = globalThis.fetch;
const states: string[] = [];
const calls: string[] = [];
const ipPrefix = `2001:db8:${randomUUID().slice(0, 4)}:`;
let requestNumber = 0;
let failure: "none" | "token" | "profile" = "none";
function cookies(response: Response) {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
}
function request(
  path: string,
  body?: unknown,
  cookie = "",
  ip = `${ipPrefix}${(++requestNumber).toString(16)}::1`,
) {
  return getAuth().handler(
    new Request(origin + "/api/auth" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Origin: origin,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        Cookie: cookie,
        "X-Forwarded-For": ip,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
}
async function start(callbackURL = origin + "/account") {
  const ip = `${ipPrefix}${(++requestNumber).toString(16)}::1`;
  const response = await request(
    "/sign-in/social",
    {
      provider: "github",
      callbackURL,
      errorCallbackURL: origin + "/sign-in",
      disableRedirect: true,
    },
    "",
    ip,
  );
  assert.equal(response.status, 200);
  const state = new URL((await response.json()).url).searchParams.get("state")!;
  assert.ok(state);
  states.push(state);
  return { state, cookie: cookies(response), ip };
}
function finish(
  flow: { state: string; cookie: string; ip: string },
  extra: Record<string, string> = { code: "fixture-authorization-code" },
) {
  return request(
    `/callback/github?${new URLSearchParams({ state: flow.state, ...extra })}`,
    undefined,
    flow.cookie,
    flow.ip,
  );
}
function assertNoSession(response: Response) {
  assert.equal(
    response.headers
      .getSetCookie()
      .some((value) => /session_token=[^;]/.test(value)),
    false,
    "failure must not issue a session",
  );
}
before(() => {
  assert.ok(
    ["localhost", "127.0.0.1", "mysql"].includes(
      new URL(process.env.DATABASE_URL!).hostname,
    ),
  );
  process.env.NODE_ENV = "test";
  process.env.BETTER_AUTH_URL = origin;
  process.env.BETTER_AUTH_SECRET = randomBytes(48).toString("base64url");
  process.env.AUTH_DEV_CREDENTIALS = "false";
  process.env.GITHUB_CLIENT_ID = "fixture-client-id";
  process.env.GITHUB_CLIENT_SECRET = "fixture-client-secret";
  // Only this isolated test process substitutes provider transport. No application bypass or live request exists.
  globalThis.fetch = async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    calls.push(url);
    if (url === "https://github.com/login/oauth/access_token") {
      const body =
        input instanceof Request
          ? await input.clone().text()
          : String(init?.body ?? "");
      const params = new URLSearchParams(body);
      assert.equal(params.get("grant_type"), "authorization_code");
      assert.equal(params.get("code"), "fixture-authorization-code");
      assert.equal(
        params.get("redirect_uri"),
        origin + "/api/auth/callback/github",
      );
      assert.ok((params.get("code_verifier") ?? "").length >= 43);
      return Response.json(
        failure === "token"
          ? { error: "fixture_unavailable" }
          : {
              access_token: "fixture-access-token",
              token_type: "bearer",
              scope: "read:user user:email",
            },
        { status: failure === "token" ? 503 : 200 },
      );
    }
    if (url === "https://api.github.com/user")
      return Response.json(
        failure === "profile"
          ? { message: "fixture_unavailable" }
          : {
              id: subject,
              login: "fixture-user",
              name: "Disposable OAuth fixture",
              email,
              avatar_url: null,
            },
        { status: failure === "profile" ? 503 : 200 },
      );
    if (url === "https://api.github.com/user/emails")
      return Response.json([{ email, primary: true, verified: true }]);
    throw Error("Unexpected fixture network request");
  };
});
after(async () => {
  globalThis.fetch = originalFetch;
  try {
    await getPool().execute("DELETE FROM rateLimit WHERE `key` LIKE ?", [
      `%${ipPrefix}%`,
    ]);
    for (const state of states)
      await getPool().execute("DELETE FROM verification WHERE identifier=?", [
        `auth-state:${state}`,
      ]);
    const [users] = await getPool().execute<RowDataPacket[]>(
      "SELECT id FROM user WHERE email=?",
      [email],
    );
    for (const row of users) {
      await getPool().execute("DELETE FROM session WHERE userId=?", [row.id]);
      await getPool().execute("DELETE FROM account WHERE userId=?", [row.id]);
      await getPool().execute("DELETE FROM user WHERE id=?", [row.id]);
    }
  } finally {
    await closePool();
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
test("OAuth rejects missing/forged state before contacting any provider", async () => {
  for (const query of [
    "code=fixture-code",
    "code=fixture-code&state=forged-fixture-state",
  ]) {
    const response = await request("/callback/github?" + query);
    assert.equal(response.status, 302);
    assertNoSession(response);
    assert.equal(new URL(response.headers.get("location")!).origin, origin);
  }
  assert.equal(calls.length, 0);
});
test("a valid OAuth denial returns to the approved local error page without creating identity", async () => {
  const flow = await start();
  const response = await finish(flow, { code: "", error: "access_denied" });
  assert.equal(response.status, 302);
  assertNoSession(response);
  assert.equal(new URL(response.headers.get("location")!).pathname, "/sign-in");
  assert.equal(calls.length, 0);
});
test("token outage fails closed, consumed state cannot replay and a fresh retry recovers", async () => {
  const flow = await start();
  failure = "token";
  const failed = await finish(flow);
  assert.equal(failed.status, 302);
  assertNoSession(failed);
  const before = calls.length;
  await finish(flow);
  assert.equal(calls.length, before);
  failure = "none";
  const recovered = await finish(await start());
  assert.equal(recovered.status, 302);
  const cookie = cookies(recovered);
  const session = await getAuth().api.getSession({
    headers: new Headers({ Cookie: cookie }),
  });
  assert.ok(session);
  assert.equal(session.user.email, email);
  assert.equal(session.user.emailVerified, true);
  const reload = await getAuth().api.getSession({
    headers: new Headers({ Cookie: cookie }),
  });
  assert.equal(reload?.user.id, session.user.id);
  await request("/sign-out", {}, cookie);
  assert.equal(
    await getAuth().api.getSession({
      headers: new Headers({ Cookie: cookie }),
    }),
    null,
  );
});
test("provider profile outage creates no session and does not grant roles", async () => {
  failure = "profile";
  const response = await finish(await start());
  assert.equal(response.status, 302);
  assertNoSession(response);
  failure = "none";
  const [roles] = await getPool().execute<RowDataPacket[]>(
    "SELECT r.user_id FROM admin_roles r JOIN user u ON u.id=r.user_id WHERE u.email=?",
    [email],
  );
  assert.equal(roles.length, 0);
});
test("OAuth state is bound to its initiating browser cookie", async () => {
  const flow = await start(),
    before = calls.length;
  const response = await finish({ ...flow, cookie: "" });
  assert.equal(response.status, 302);
  assertNoSession(response);
  assert.equal(calls.length, before);
});
test("expired OAuth state fails before provider work", async () => {
  const flow = await start(),
    before = calls.length;
  await getPool().execute(
    "UPDATE verification SET expiresAt=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 SECOND),value=JSON_SET(value,'$.expiresAt',?) WHERE identifier=?",
    [Date.now() - 1000, `auth-state:${flow.state}`],
  );
  const response = await finish(flow);
  assert.equal(response.status, 302);
  assertNoSession(response);
  assert.equal(calls.length, before);
});
test("social sign-in refuses callback redirects outside the exact trusted origin", async () => {
  const response = await request("/sign-in/social", {
    provider: "github",
    callbackURL: "https://untrusted.example.test/return",
    disableRedirect: true,
  });
  assert.equal(response.status, 403);
  assertNoSession(response);
});
