import { test } from "node:test";
import assert from "node:assert/strict";
import { compareAuditAnchor } from "../scripts/operations/audit-anchor";
import type { Snapshot } from "../scripts/operations/database-snapshot";
const snapshot = (rows: (string | number | null)[][]): Snapshot => ({
  version: 1,
  capturedAt: "2026-10-21T00:00:00Z",
  migrations: [],
  tables: [
    { name: "security_audit", columns: ["id", "reason", "case_key"], rows },
  ],
});
test("independent audit anchor permits appended rows and rejects rewritten or missing history", () => {
  const anchor = Buffer.from(
    JSON.stringify(snapshot([["1", "fixture reason", null]])),
  );
  assert.equal(
    compareAuditAnchor(
      anchor,
      snapshot([
        ["1", "fixture reason", null],
        ["2", "new fixture", null],
      ]),
    ).anchoredRows,
    1,
  );
  for (const rows of [
    [],
    [["1", "altered", null]],
    [["2", "replacement", null]],
  ])
    assert.throws(() => compareAuditAnchor(anchor, snapshot(rows)));
  assert.throws(() =>
    compareAuditAnchor(Buffer.from('{"version":99}'), snapshot([])),
  );
});
