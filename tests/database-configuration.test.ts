import { test } from "node:test";
import assert from "node:assert/strict";
import {
  databaseConfiguration,
  databaseUnavailable,
} from "@tradecrafters/database/pool";
const local = {
  DATABASE_URL: "mysql://fixture:fixture@127.0.0.1:3307/fixture_db",
};
test("database URLs cannot smuggle TLS options or expose invalid URL values", () => {
  for (const value of [
    "private-invalid-value",
    local.DATABASE_URL + "?ssl=false",
    local.DATABASE_URL + "#fragment",
    "mysql://host/",
  ]) {
    assert.throws(() => databaseConfiguration({ DATABASE_URL: value }));
  }
  assert.throws(
    () => databaseConfiguration({ DATABASE_URL: "private-invalid-value" }),
    (error: Error) => !error.message.includes("private-invalid-value"),
  );
});
test("remote MySQL requires verified TLS and supports one hosted PEM CA source", () => {
  const env = {
    DATABASE_URL: "mysql://fixture:fixture@mysql.example.test/fixture_db",
  };
  assert.throws(() => databaseConfiguration(env), /verified TLS/);
  const config = databaseConfiguration({
    ...env,
    MYSQL_SSL: "true",
    MYSQL_SSL_CA: "fixture-public-ca",
  });
  assert.deepEqual(config.ssl, {
    rejectUnauthorized: true,
    verifyIdentity: true,
    ca: "fixture-public-ca",
  });
  assert.throws(
    () =>
      databaseConfiguration({
        ...env,
        MYSQL_SSL: "true",
        MYSQL_SSL_CA: "fixture",
        MYSQL_SSL_CA_FILE: "fixture",
      }),
    /one MySQL CA/,
  );
});
test("production uses a small pool with a finite driver burst queue", () => {
  const config = databaseConfiguration({ ...local, NODE_ENV: "production" });
  assert.equal(config.connectionLimit, 2);
  assert.equal(config.maxIdle, 0);
  assert.equal(config.idleTimeout, 5000);
  assert.equal(config.waitForConnections, true);
  assert.equal(config.queueLimit, 30);
  assert.equal(config.connectTimeout, 5000);
  for (const size of ["0", "21", "2.5", "NaN"])
    assert.throws(() =>
      databaseConfiguration({ ...local, MYSQL_POOL_SIZE: size }),
    );
});
test("only known capacity or transport faults receive a retryable database classification", () => {
  assert.equal(databaseUnavailable(Error("No connections available.")), true);
  assert.equal(
    databaseUnavailable(
      Object.assign(Error("hidden"), { code: "ER_TOO_MANY_USER_CONNECTIONS" }),
    ),
    true,
  );
  assert.equal(
    databaseUnavailable(
      Object.assign(Error("hidden"), { code: "ER_BAD_FIELD_ERROR" }),
    ),
    false,
  );
  assert.equal(databaseUnavailable(Error("private SQL message")), false);
});
