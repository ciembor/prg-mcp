import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { initializePrgDatabases } from "../../../src/features/persistence/index.js";
import { createSqliteSnapshotStore, type SnapshotMetadata } from "../../../src/features/synchronization/index.js";

describe("SQLite snapshot metadata", () => {
  it("persists and updates complete synchronization provenance", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "prg-sync-metadata-"));
    const { catalogPath } = initializePrgDatabases({ addressShardCodes: ["14"], dataDir });
    const store = createSqliteSnapshotStore(catalogPath);
    const metadata: SnapshotMetadata = {
      adapterVersion: "wfs-2", checkedAt: "2026-06-23T00:00:00.000Z", datasetKey: "current:A00",
      downloadedAt: "2026-06-23T00:00:00.000Z", etag: "one", lastModified: "Mon, 22 Jun 2026 00:00:00 GMT",
      recordCount: 1, schemaFingerprint: "schema", scope: "country:PL", sha256: "abc",
      sourceUrl: "https://example.test/wfs", stateDate: "2026-06-22",
    };
    await store.save(metadata);
    await store.save({ ...metadata, checkedAt: "2026-06-24T00:00:00.000Z", etag: "two" });
    expect(await store.find(metadata.datasetKey, metadata.scope)).toEqual({ ...metadata, checkedAt: "2026-06-24T00:00:00.000Z", etag: "two" });
  });
});
