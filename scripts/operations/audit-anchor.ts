import assert from "node:assert/strict";
import type { Snapshot } from "./database-snapshot";

// This compares DATA ONLY from an already authenticated archive. It does not
// relax the restore decoder's exact migration/checksum requirement or run SQL.
export function compareAuditAnchor(plaintext: Buffer, current: Snapshot) {
  assert.ok(plaintext.length <= 64 * 1024 * 1024);
  const archive = JSON.parse(plaintext.toString("utf8")) as Snapshot;
  assert.equal(archive.version, 1);
  assert.ok(Number.isFinite(Date.parse(archive.capturedAt)));
  assert.ok(Array.isArray(archive.tables));
  const tables = archive.tables.filter(
    (table) => table.name === "security_audit",
  );
  assert.equal(tables.length, 1);
  const anchor = tables[0],
    live = current.tables.find((table) => table.name === "security_audit")!;
  assert.ok(live);
  assert.deepEqual(anchor.columns, live.columns);
  assert.ok(anchor.columns.includes("case_key"));
  assert.ok(Array.isArray(anchor.rows) && anchor.rows.length <= 100_000);
  const index = anchor.columns.indexOf("id");
  assert.ok(index >= 0);
  const seen = new Set<string>();
  const retained = new Map(
    live.rows.map((row) => [String(row[index]), JSON.stringify(row)]),
  );
  for (const row of anchor.rows) {
    assert.equal(row.length, anchor.columns.length);
    const id = String(row[index]);
    assert.match(id, /^[1-9][0-9]*$/);
    assert.equal(seen.has(id), false);
    seen.add(id);
    assert.equal(
      retained.get(id),
      JSON.stringify(row),
      "Historical audit differs from independent anchor.",
    );
  }
  return {
    anchoredRows: anchor.rows.length,
    currentRows: live.rows.length,
    historicalRowsUnchanged: true,
  };
}
