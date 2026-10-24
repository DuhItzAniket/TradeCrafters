import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEnv } from "node:util";
import { appEnvironment } from "../scripts/local-env.mjs";

test("web environment filtering removes complete provider multiline values while preserving OAuth and unrelated settings", () => {
  const source = [
    "# local settings",
    "GITHUB_CLIENT_ID=fixture-client",
    "PROVIDER_DATABASE_URL=mysql://fixture:fixture@127.0.0.1/tradecrafters_marketdata",
    'PROVIDER_MYSQL_SSL_CA="fixture-hidden-start',
    'fixture-hidden-end"',
    "export PROVIDER_API_KEY=fixture-hidden-key",
    "OPERATOR_DATABASE_URL='fixture-hidden-operator'",
    "BETTER_AUTH_SECRET=fixture-preserved-secret",
    "DATABASE_URL=mysql://fixture:fixture@127.0.0.1/fixture_operator",
    'KEEP="value # preserved"',
  ].join("\n");
  const runtime = "mysql://fixture:fixture@127.0.0.1/fixture_web",
    output = appEnvironment(source, runtime);
  assert.deepEqual(parseEnv(output), {
    GITHUB_CLIENT_ID: "fixture-client",
    BETTER_AUTH_SECRET: "fixture-preserved-secret",
    DATABASE_URL: runtime,
    KEEP: "value # preserved",
  });
  assert.ok(output.includes("# local settings"));
  assert.ok(!output.includes("hidden"));
});
