import { readFileSync } from "node:fs";
import { createPool, type Pool, type PoolOptions } from "mysql2/promise";

const state = globalThis as typeof globalThis & { tradecraftersPool?: Pool };
export function databaseConfiguration(
  env: NodeJS.ProcessEnv = process.env,
): PoolOptions {
  const raw = env.DATABASE_URL;
  if (!raw)
    throw new Error(
      "DATABASE_URL is required. See docs/implementation/local-development.md.",
    );
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid DATABASE_URL (value hidden).");
  }
  if (
    url.protocol !== "mysql:" ||
    url.search ||
    url.hash ||
    !url.username ||
    !/^\/[a-zA-Z0-9_]{1,64}$/.test(url.pathname)
  )
    throw new Error(
      "DATABASE_URL must be a mysql:// identity and database without query or fragment.",
    );
  const local = ["127.0.0.1", "localhost", "mysql"].includes(url.hostname);
  if (!local && env.MYSQL_SSL !== "true")
    throw new Error("Remote MySQL requires verified TLS (MYSQL_SSL=true).");
  const size = Number(
    env.MYSQL_POOL_SIZE || (env.NODE_ENV === "production" ? 2 : 5),
  );
  if (!Number.isInteger(size) || size < 1 || size > 20)
    throw new Error("MYSQL_POOL_SIZE must be 1–20");
  if (env.MYSQL_SSL_CA && env.MYSQL_SSL_CA_FILE)
    throw new Error("Set only one MySQL CA source.");
  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    timezone: "Z",
    connectionLimit: size,
    // A small burst may queue, but getPool adds an acquisition deadline to the
    // callback pool so direct queries and the auth adapter share the same bound.
    waitForConnections: true,
    queueLimit: 30,
    enableKeepAlive: true,
    connectTimeout: 5000,
    supportBigNumbers: true,
    bigNumberStrings: true,
    decimalNumbers: false,
    multipleStatements: false,
    ssl:
      env.MYSQL_SSL === "true"
        ? {
            rejectUnauthorized: true,
            verifyIdentity: true,
            ...(env.MYSQL_SSL_CA
              ? { ca: env.MYSQL_SSL_CA }
              : env.MYSQL_SSL_CA_FILE
                ? { ca: readFileSync(env.MYSQL_SSL_CA_FILE, "utf8") }
                : {}),
          }
        : undefined,
  };
}
export function databaseUnavailable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (
    error.message === "No connections available." ||
    error.message === "Pool is closed." ||
    error.message === "Queue limit reached."
  )
    return true;
  return (
    "code" in error &&
    [
      "DB_ACQUIRE_TIMEOUT",
      "ER_CON_COUNT_ERROR",
      "ER_TOO_MANY_USER_CONNECTIONS",
      "ER_USER_LIMIT_REACHED",
      "ECONNREFUSED",
      "ECONNRESET",
      "ETIMEDOUT",
      "ENOTFOUND",
      "EAI_AGAIN",
      "PROTOCOL_CONNECTION_LOST",
    ].includes(String(error.code))
  );
}
export function getPool(): Pool {
  if (state.tradecraftersPool) return state.tradecraftersPool;
  state.tradecraftersPool = createPool(databaseConfiguration());
  const driver = state.tradecraftersPool.pool;
  const acquire = driver.getConnection.bind(driver);
  driver.getConnection = (callback) => {
    let completed = false;
    const deadline = setTimeout(() => {
      completed = true;
      Reflect.apply(callback, undefined, [
        Object.assign(new Error("Database capacity wait expired."), {
          code: "DB_ACQUIRE_TIMEOUT",
        }),
      ]);
    }, 2000);
    acquire((error, connection) => {
      if (completed) {
        // mysql2 does not expose cancellation of queued acquisitions. Their
        // bounded queue entries drain after capacity returns; never hand a late
        // connection to a timed-out caller or allow it to execute a statement.
        connection?.release();
        return;
      }
      completed = true;
      clearTimeout(deadline);
      callback(error, connection);
    });
  };
  // Driver timezone controls serialization; set the MySQL session timezone too.
  state.tradecraftersPool.pool.on("connection", (connection) => {
    connection.query("SET time_zone = '+00:00'", (error) => {
      if (error) connection.destroy();
    });
  });
  return state.tradecraftersPool;
}
export async function closePool() {
  await state.tradecraftersPool?.end();
  delete state.tradecraftersPool;
}
