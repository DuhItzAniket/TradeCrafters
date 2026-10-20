import { readFileSync } from "node:fs";
import { createPool, type Pool } from "mysql2/promise";

const state = globalThis as typeof globalThis & { tradecraftersPool?: Pool };
export function getPool(): Pool {
  if (state.tradecraftersPool) return state.tradecraftersPool;
  const raw = process.env.DATABASE_URL;
  if (!raw)
    throw new Error(
      "DATABASE_URL is required. See docs/implementation/local-development.md.",
    );
  const url = new URL(raw);
  if (url.protocol !== "mysql:")
    throw new Error("DATABASE_URL must use mysql://");
  const local = ["127.0.0.1", "localhost", "mysql"].includes(url.hostname);
  if (!local && process.env.MYSQL_SSL !== "true")
    throw new Error("Remote MySQL requires verified TLS (MYSQL_SSL=true).");
  const size = Number(process.env.MYSQL_POOL_SIZE || 5);
  if (!Number.isInteger(size) || size < 1 || size > 20)
    throw new Error("MYSQL_POOL_SIZE must be 1–20");
  state.tradecraftersPool = createPool({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    timezone: "Z",
    connectionLimit: size,
    waitForConnections: true,
    queueLimit: 30,
    enableKeepAlive: true,
    connectTimeout: 10000,
    supportBigNumbers: true,
    bigNumberStrings: true,
    decimalNumbers: false,
    multipleStatements: false,
    ssl:
      process.env.MYSQL_SSL === "true"
        ? {
            rejectUnauthorized: true,
            ...(process.env.MYSQL_SSL_CA_FILE
              ? { ca: readFileSync(process.env.MYSQL_SSL_CA_FILE, "utf8") }
              : {}),
          }
        : undefined,
  });
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
