import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "./pool";

export async function migrate() {
  const connection = await getPool().getConnection();
  try {
    const [lock] = await connection.query<RowDataPacket[]>(
      "SELECT GET_LOCK('tradecrafters_schema', 10) AS acquired",
    );
    if (Number(lock[0].acquired) !== 1)
      throw new Error("Migration lock unavailable");
    await connection.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(120) PRIMARY KEY, checksum CHAR(64) NOT NULL, completed BOOLEAN NOT NULL DEFAULT false, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB",
    );
    const folder = new URL("../migrations/", import.meta.url);
    for (const name of (await readdir(folder))
      .filter((name) => /^\d{4}_[a-z_]+\.sql$/.test(name))
      .sort()) {
      const sql = (await readFile(new URL(name, folder), "utf8"))
        .replace(/^\uFEFF/, "")
        .replace(/\r\n/g, "\n");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const [previous] = await connection.execute<RowDataPacket[]>(
        "SELECT checksum, completed FROM schema_migrations WHERE name = ?",
        [name],
      );
      if (previous.length) {
        if (previous[0].checksum !== checksum)
          throw new Error(`Applied migration changed: ${name}`);
        if (!previous[0].completed)
          throw new Error(
            `Incomplete MySQL DDL migration: ${name}. Inspect schema and restore/repair explicitly; do not retry blindly.`,
          );
        continue;
      }
      // MySQL DDL commits implicitly. Leave an incomplete marker on any failure.
      await connection.execute(
        "INSERT INTO schema_migrations (name, checksum) VALUES (?, ?)",
        [name, checksum],
      );
      const statements = sql
        .replace(/^--.*$/gm, "")
        .split(";")
        .map((part) => part.trim())
        .filter(Boolean);
      for (const statement of statements) await connection.query(statement);
      await connection.execute(
        "UPDATE schema_migrations SET completed = true WHERE name = ?",
        [name],
      );
      console.log(`Applied ${name}`);
    }
  } finally {
    await connection.query("SELECT RELEASE_LOCK('tradecrafters_schema')");
    connection.release();
  }
}
