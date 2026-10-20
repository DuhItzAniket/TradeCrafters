import { test } from "node:test";
import assert from "node:assert/strict";
import { authConfiguration } from "@tradecrafters/database/auth";
function withConfig(run: () => void) {
  const names = [
    "NODE_ENV",
    "BETTER_AUTH_URL",
    "BETTER_AUTH_SECRET",
    "AUTH_DEV_CREDENTIALS",
    "GITHUB_CLIENT_ID",
    "GITHUB_CLIENT_SECRET",
  ];
  const saved = new Map(names.map((name) => [name, process.env[name]]));
  try {
    process.env.NODE_ENV = "test";
    process.env.BETTER_AUTH_URL = "http://127.0.0.1:3000";
    process.env.BETTER_AUTH_SECRET =
      "fixture-auth-secret-for-tests-only-do-not-deploy-123456";
    process.env.AUTH_DEV_CREDENTIALS = "false";
    delete process.env.GITHUB_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_SECRET;
    run();
  } finally {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}
test("authentication trusts one exact origin and rejects embedded credentials and path/query variants", () =>
  withConfig(() => {
    for (const origin of [
      "https://user:password@example.test",
      "https://example.test/path",
      "https://example.test/?redirect=other",
      "https://example.test/#fragment",
      "ftp://example.test",
    ]) {
      process.env.BETTER_AUTH_URL = origin;
      assert.throws(() => authConfiguration(), /exact HTTP/);
    }
  }));
test("GitHub configuration requires a complete pair and exposes a boolean readiness flag", () =>
  withConfig(() => {
    assert.equal(authConfiguration().github, false);
    process.env.GITHUB_CLIENT_ID = "fixture-client-id";
    assert.throws(() => authConfiguration(), /both GitHub/);
    process.env.GITHUB_CLIENT_SECRET = "fixture-client-secret";
    assert.equal(authConfiguration().github, true);
    assert.equal(typeof authConfiguration().github, "boolean");
  }));
test("production identity requires HTTPS and GitHub and always rejects development passwords", () =>
  withConfig(() => {
    process.env.NODE_ENV = "production";
    assert.throws(() => authConfiguration(), /HTTPS/);
    process.env.BETTER_AUTH_URL = "https://tradecrafters.example.test";
    assert.throws(() => authConfiguration(), /GitHub/);
    process.env.GITHUB_CLIENT_ID = "fixture-client-id";
    process.env.GITHUB_CLIENT_SECRET = "fixture-client-secret";
    assert.equal(
      authConfiguration().url.origin,
      "https://tradecrafters.example.test",
    );
    process.env.AUTH_DEV_CREDENTIALS = "true";
    assert.throws(() => authConfiguration(), /Development password/);
  }));
