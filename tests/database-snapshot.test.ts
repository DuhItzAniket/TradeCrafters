import { test } from "node:test";
import assert from "node:assert/strict";
import {
  migrationManifest,
  readSnapshot,
  snapshotBytes,
  snapshotFingerprint,
  type Snapshot,
} from "../scripts/operations/database-snapshot";

test("logical archive rejects schema drift, SQL identifiers, malformed rows and unknown versions before restore", async () => {
  const valid: Snapshot = {
    version: 1,
    capturedAt: new Date().toISOString(),
    migrations: await migrationManifest(),
    tables: [{ name: "fixture", columns: ["id"], rows: [["x"]] }],
  };
  assert.deepEqual(await readSnapshot(snapshotBytes(valid)), valid);
  for (const invalid of [
    { ...valid, version: 2 },
    { ...valid, migrations: [] },
    {
      ...valid,
      tables: [
        { name: "fixture; DROP DATABASE live", columns: ["id"], rows: [] },
      ],
    },
    {
      ...valid,
      tables: [{ name: "fixture", columns: ["id"], rows: [["x", "extra"]] }],
    },
    {
      ...valid,
      tables: [
        { name: "fixture", columns: ["id"], rows: [[{ sql: "SELECT 1" }]] },
      ],
    },
  ])
    await assert.rejects(() =>
      readSnapshot(Buffer.from(JSON.stringify(invalid))),
    );
});

test("archive fingerprint ignores row ordering and preserves exact numeric strings and nulls", async () => {
  const snapshot: Snapshot = {
    version: 1,
    capturedAt: new Date().toISOString(),
    migrations: await migrationManifest(),
    tables: [
      {
        name: "fixture",
        columns: ["amount", "label"],
        rows: [
          ["9007199254740993", null],
          ["0", "日本語"],
        ],
      },
    ],
  };
  const decoded = await readSnapshot(snapshotBytes(snapshot));
  assert.deepEqual(
    snapshotFingerprint(decoded),
    snapshotFingerprint({
      ...snapshot,
      tables: [
        { ...snapshot.tables[0], rows: [...snapshot.tables[0].rows].reverse() },
      ],
    }),
  );
  assert.notDeepEqual(
    snapshotFingerprint(decoded),
    snapshotFingerprint({
      ...snapshot,
      tables: [
        {
          ...snapshot.tables[0],
          rows: [
            ["9007199254740992", null],
            ["0", "日本語"],
          ],
        },
      ],
    }),
  );
});
