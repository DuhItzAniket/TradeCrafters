import { test } from "node:test";
import assert from "node:assert/strict";
import runtimeGrants from "../packages/database/runtime-grants.json" with { type: "json" };
import {
  exactRuntimeGrants,
  connectionBudget,
  webEnvironment,
} from "../scripts/operations/preflight";
test("release grant inspection rejects wildcard, extra, inherited and incomplete permissions", () => {
  const grants = Object.entries(runtimeGrants).map(
    ([table, value]) =>
      `GRANT ${value} ON \`fixture\`.\`${table}\` TO \`web\`@\`%\``,
  );
  assert.equal(exactRuntimeGrants(grants, "fixture"), true);
  for (const invalid of [
    grants.slice(1),
    [...grants, "GRANT SELECT ON *.* TO `web`@`%`"],
    [...grants, "GRANT `operator`@`%` TO `web`@`%`"],
    grants.map((grant) =>
      grant.replace(
        "SELECT,INSERT,UPDATE (state,version)",
        "SELECT,INSERT,UPDATE",
      ),
    ),
  ])
    assert.equal(exactRuntimeGrants(invalid, "fixture"), false);
});
test("Aiven ANSI identifier quoting preserves the exact grant boundary", () => {
  const grants = Object.entries(runtimeGrants).map(
    ([table, value]) =>
      `GRANT ${value.replace("(state,version)", '("version", "state")')} ON "fixture"."${table}" TO "web"@"%"`,
  );
  assert.equal(exactRuntimeGrants(grants, "fixture"), true);
  assert.equal(
    exactRuntimeGrants(
      [...grants, 'GRANT SELECT ON "other"."user" TO "web"@"%"'],
      "fixture",
    ),
    false,
  );
  assert.equal(
    exactRuntimeGrants(
      grants.map((grant) => grant.replace('"fixture".', '"fixture`.')),
      "fixture",
    ),
    false,
  );
});

test("an aggregate user cap must reserve operator capacity and fit at least one process", () => {
  assert.deepEqual(connectionBudget(76, 20, 16, 2), {
    serverMax: 76,
    userCap: 20,
    reserved: 16,
    connectionsPerProcess: 2,
    nominalFullPools: 10,
  });
  for (const values of [
    [76, 0, 16, 2],
    [76, 70, 16, 2],
    [76, 1, 16, 2],
    [76, 20, 0, 2],
    [76, 20.5, 16, 2],
  ])
    assert.throws(() =>
      connectionBudget(values[0], values[1], values[2], values[3]),
    );
});
test("web release configuration rejects privileged operator/bootstrap secrets", () => {
  webEnvironment({ DATABASE_URL: "fixture" });
  for (const name of [
    "OPERATOR_DATABASE_URL",
    "MIGRATION_DATABASE_URL",
    "LOCAL_RUNTIME_DATABASE_URL",
    "LOCAL_DB_PASSWORD",
    "LOCAL_DB_ROOT_PASSWORD",
  ])
    assert.throws(() => webEnvironment({ [name]: "fixture" }));
});
