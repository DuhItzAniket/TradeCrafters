import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

// A bounded logical archive for this small prototype. It contains data, never
// executable SQL, grants, credentials or a restore destination. Schema comes
// from the reviewed, checksummed migration files in the checkout.
type Cell = string | number | null;
export type Snapshot = {
  version: 1;
  capturedAt: string;
  migrations: { name: string; checksum: string }[];
  tables: { name: string; columns: string[]; rows: Cell[][] }[];
};
const maxBytes = 64 * 1024 * 1024;
const maxRows = 100_000;
const identifier = (name: string) => {
  assert.match(name, /^[a-zA-Z0-9_]{1,64}$/);
  return `\`${name}\``;
};
export async function migrationManifest() {
  const folder = new URL(
    "../../packages/database/migrations/",
    import.meta.url,
  );
  const names = (await readdir(folder))
    .filter((name) => /^\d{4}_[a-z_]+\.sql$/.test(name))
    .sort();
  return Promise.all(
    names.map(async (name) => ({
      name,
      checksum: createHash("sha256")
        .update(
          (await readFile(new URL(name, folder), "utf8"))
            .replace(/^\uFEFF/, "")
            .replace(/\r\n/g, "\n"),
        )
        .digest("hex"),
    })),
  );
}
export function snapshotBytes(snapshot: Snapshot) {
  const bytes = Buffer.from(JSON.stringify(snapshot));
  assert.ok(bytes.length <= maxBytes, "Snapshot exceeds the prototype limit.");
  return bytes;
}
export async function readSnapshot(bytes: Buffer): Promise<Snapshot> {
  assert.ok(bytes.length <= maxBytes);
  const value = JSON.parse(bytes.toString("utf8")) as Snapshot;
  assert.equal(value.version, 1);
  assert.ok(Number.isFinite(Date.parse(value.capturedAt)));
  assert.deepEqual(value.migrations, await migrationManifest());
  assert.ok(Array.isArray(value.tables) && value.tables.length > 0);
  const names = new Set<string>();
  let rows = 0;
  for (const table of value.tables) {
    identifier(table.name);
    assert.equal(names.has(table.name), false);
    names.add(table.name);
    assert.ok(table.columns.length > 0);
    assert.equal(new Set(table.columns).size, table.columns.length);
    table.columns.forEach(identifier);
    for (const row of table.rows) {
      assert.equal(row.length, table.columns.length);
      assert.ok(
        row.every(
          (cell) =>
            cell === null ||
            typeof cell === "string" ||
            (typeof cell === "number" && Number.isFinite(cell)),
        ),
      );
    }
    rows += table.rows.length;
    assert.ok(rows <= maxRows);
  }
  return value;
}
export function snapshotFingerprint(snapshot: Snapshot) {
  const hash = createHash("sha256");
  let rows = 0;
  for (const table of [...snapshot.tables].sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    rows += table.rows.length;
    hash.update(
      JSON.stringify([
        table.name,
        table.columns,
        table.rows.map((row) => JSON.stringify(row)).sort(),
      ]),
    );
  }
  return { tables: snapshot.tables.length, rows, digest: hash.digest("hex") };
}
async function inventory(connection: PoolConnection) {
  const [rows] = await connection.query<RowDataPacket[]>(
    "SELECT TABLE_NAME,ENGINE,TABLE_TYPE FROM information_schema.tables WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME",
  );
  assert.ok(rows.length > 0);
  assert.ok(
    rows.every(
      (row) => row.ENGINE === "InnoDB" && row.TABLE_TYPE === "BASE TABLE",
    ),
  );
  return rows.map((row) => String(row.TABLE_NAME));
}
export async function captureSnapshot(pool: Pool): Promise<Snapshot> {
  const connection = await pool.getConnection();
  let locked = false;
  try {
    const [lock] = await connection.query<RowDataPacket[]>(
      "SELECT GET_LOCK('tradecrafters_schema',10) AS acquired",
    );
    assert.equal(Number(lock[0].acquired), 1);
    locked = true;
    // Serialize against the project's migration command, then take one InnoDB
    // snapshot. Ordinary app writes may continue; no per-table live reads.
    await connection.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await connection.query(
      "START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY",
    );
    const migrations = await migrationManifest();
    const [applied] = await connection.query<RowDataPacket[]>(
      "SELECT name,checksum,completed FROM schema_migrations ORDER BY name",
    );
    assert.ok(applied.every((row) => Number(row.completed) === 1));
    assert.deepEqual(
      applied.map(({ name, checksum }) => ({ name, checksum })),
      migrations,
    );
    const snapshot: Snapshot = {
      version: 1,
      capturedAt: new Date().toISOString(),
      migrations,
      tables: [],
    };
    let rowCount = 0;
    for (const name of await inventory(connection)) {
      const [rows, fields] = await connection.query({
        sql: `SELECT * FROM ${identifier(name)} LIMIT ${maxRows + 1}`,
        rowsAsArray: true,
        dateStrings: true,
        typeCast: (field, next) =>
          field.type === "JSON" ? field.string("utf8") : next(),
      });
      const values = rows as Cell[][];
      rowCount += values.length;
      assert.ok(
        rowCount <= maxRows,
        "Snapshot exceeds the prototype row limit.",
      );
      snapshot.tables.push({
        name,
        columns: fields.map((field) => field.name),
        rows: values,
      });
    }
    await readSnapshot(snapshotBytes(snapshot));
    await connection.commit();
    return snapshot;
  } finally {
    await connection.rollback();
    if (locked)
      await connection.query("SELECT RELEASE_LOCK('tradecrafters_schema')");
    connection.release();
  }
}

// The caller provisions/migrates a NEW, unexposed database. It never receives
// a production restore option. Exact name + empty-data guards are repeated on
// the actual connection; no SQL from an archive is ever executed.
export async function restoreSnapshot(
  pool: Pool,
  snapshot: Snapshot,
  database: string,
) {
  assert.match(database, /^tc_restore_[a-f0-9]{16}$/);
  await readSnapshot(snapshotBytes(snapshot));
  const connection = await pool.getConnection();
  try {
    const [target] = await connection.query<RowDataPacket[]>(
      "SELECT DATABASE() AS name",
    );
    assert.equal(target[0].name, database);
    const names = await inventory(connection);
    assert.deepEqual(
      [...names].sort(),
      snapshot.tables.map((table) => table.name).sort(),
    );
    for (const name of names) {
      const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS n FROM ${identifier(name)}`,
      );
      const migrationSeeds: Record<string, number> = {
        schema_migrations: snapshot.migrations.length,
        simulation_control: 1,
        catalog_import_guard: 1,
        ingress_budget_control: 3,
      };
      assert.equal(
        Number(rows[0].n),
        migrationSeeds[name] || 0,
        "Restore target must have no application data.",
      );
      const [, fields] = await connection.query(
        `SELECT * FROM ${identifier(name)} LIMIT 0`,
      );
      assert.deepEqual(
        fields.map((field) => field.name),
        snapshot.tables.find((table) => table.name === name)!.columns,
      );
    }
    // Events and INSERT guards are restored from reviewed migrations only after
    // data validation. This target has no web identity, grants or public route.
    const [triggers] = await connection.query<RowDataPacket[]>("SHOW TRIGGERS");
    for (const trigger of triggers)
      await connection.query(
        `DROP TRIGGER ${identifier(String(trigger.Trigger))}`,
      );
    const [events] = await connection.query<RowDataPacket[]>("SHOW EVENTS");
    for (const event of events)
      await connection.query(`DROP EVENT ${identifier(String(event.Name))}`);
    await connection.query("SET FOREIGN_KEY_CHECKS=0");
    await connection.beginTransaction();
    for (const name of names)
      await connection.query(`DELETE FROM ${identifier(name)}`);
    for (const table of snapshot.tables) {
      const [generated] = await connection.execute<RowDataPacket[]>(
        "SELECT COLUMN_NAME FROM information_schema.columns WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND GENERATION_EXPRESSION<>''",
        [table.name],
      );
      const generatedNames = new Set(
        generated.map((column) => String(column.COLUMN_NAME)),
      );
      const writable = table.columns
        .map((name, index) => ({ name, index }))
        .filter(({ name }) => !generatedNames.has(name));
      const columns = writable.map(({ name }) => identifier(name)).join(",");
      const placeholders = writable.map(() => "?").join(",");
      for (let offset = 0; offset < table.rows.length; offset += 100) {
        const rows = table.rows.slice(offset, offset + 100);
        await connection.execute(
          `INSERT INTO ${identifier(table.name)} (${columns}) VALUES ${rows.map(() => `(${placeholders})`).join(",")}`,
          rows.flatMap((row) => writable.map(({ index }) => row[index])),
        );
      }
    }
    const [foreignKeys] = await connection.query<RowDataPacket[]>(
      "SELECT TABLE_NAME,COLUMN_NAME,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME,CONSTRAINT_NAME,ORDINAL_POSITION FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY TABLE_NAME,CONSTRAINT_NAME,ORDINAL_POSITION",
    );
    const constraints = new Map<string, RowDataPacket[]>();
    for (const key of foreignKeys) {
      const id = `${key.TABLE_NAME}:${key.CONSTRAINT_NAME}`;
      constraints.set(id, [...(constraints.get(id) || []), key]);
    }
    for (const keys of constraints.values()) {
      const match = keys
        .map(
          (key) =>
            `child.${identifier(key.COLUMN_NAME)}=parent.${identifier(key.REFERENCED_COLUMN_NAME)}`,
        )
        .join(" AND ");
      const present = keys
        .map((key) => `child.${identifier(key.COLUMN_NAME)} IS NOT NULL`)
        .join(" AND ");
      const [orphans] = await connection.query<RowDataPacket[]>(
        `SELECT 1 FROM ${identifier(keys[0].TABLE_NAME)} child LEFT JOIN ${identifier(keys[0].REFERENCED_TABLE_NAME)} parent ON ${match} WHERE ${present} AND parent.${identifier(keys[0].REFERENCED_COLUMN_NAME)} IS NULL LIMIT 1`,
      );
      assert.equal(orphans.length, 0, "Restored foreign key is invalid.");
    }
    await connection.commit();
    await connection.query("SET FOREIGN_KEY_CHECKS=1");
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    try {
      await connection.query("SET FOREIGN_KEY_CHECKS=1");
    } finally {
      connection.release();
    }
  }
}

export async function restoreMaintenance(pool: Pool, database: string) {
  assert.match(database, /^tc_restore_[a-f0-9]{16}$/);
  const connection = await pool.getConnection();
  try {
    const [target] = await connection.query<RowDataPacket[]>(
      "SELECT DATABASE() AS name",
    );
    assert.equal(target[0].name, database);
    const folder = new URL(
      "../../packages/database/migrations/",
      import.meta.url,
    );
    for (const { name } of await migrationManifest()) {
      const sql = (await readFile(new URL(name, folder), "utf8")).replace(
        /\r\n/g,
        "\n",
      );
      if (
        sql.startsWith("-- @single-statement\nCREATE TRIGGER ") ||
        /^(?:-- @single-statement\n)?CREATE EVENT /.test(sql)
      )
        await connection.query(sql);
    }
    const [triggers] = await connection.query<RowDataPacket[]>("SHOW TRIGGERS");
    const [events] = await connection.query<RowDataPacket[]>("SHOW EVENTS");
    assert.equal(triggers.length, 2);
    assert.deepEqual(events.map((event) => event.Name).sort(), [
      "auth_counter_expiry",
      "identity_record_expiry",
      "ingress_counter_expiry",
    ]);
    assert.ok(events.every((event) => event.Status === "ENABLED"));
    return { triggers: triggers.length, enabledEvents: events.length };
  } finally {
    connection.release();
  }
}

export async function discardRestoredAuthority(pool: Pool, database: string) {
  assert.match(database, /^tc_restore_[a-f0-9]{16}$/);
  const connection = await pool.getConnection();
  try {
    const [target] = await connection.query<RowDataPacket[]>(
      "SELECT DATABASE() AS name",
    );
    assert.equal(target[0].name, database);
    await connection.beginTransaction();
    const [old] = await connection.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS n FROM session",
    );
    await connection.query("DELETE FROM mfa_stepups");
    await connection.query("DELETE FROM session");
    await connection.query("DELETE FROM verification");
    await connection.query(
      "UPDATE account SET accessToken=NULL,refreshToken=NULL,idToken=NULL,accessTokenExpiresAt=NULL,refreshTokenExpiresAt=NULL",
    );
    const [remaining] = await connection.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS n FROM session",
    );
    assert.equal(Number(remaining[0].n), 0);
    await connection.commit();
    return {
      discardedRestoredSessions: Number(old[0].n),
      providerTokensDiscarded: true,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
