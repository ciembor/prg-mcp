import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";

import { initializePrgDatabases } from "../../../src/features/persistence/index.js";
import { getPrgLayer } from "../../../src/features/source-catalog/index.js";
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
    const layer = getPrgLayer("A00");
    if (!layer) throw new Error("Missing test layer.");

    await store.save(metadata, {
      datasetKey: metadata.datasetKey,
      estimatedDiskBytes: 1,
      estimatedDownloadBytes: 1,
      layer,
      scope: { code: "PL", type: "country" },
    });
    await store.save({ ...metadata, archiveYear: 2024, checkedAt: "2026-06-24T00:00:00.000Z", etag: "two" }, {
      datasetKey: metadata.datasetKey,
      estimatedDiskBytes: 1,
      estimatedDownloadBytes: 1,
      layer,
      scope: { code: "PL", type: "country" },
    });
    expect(await store.find(metadata.datasetKey, metadata.scope)).toEqual({ ...metadata, archiveYear: 2024, checkedAt: "2026-06-24T00:00:00.000Z", etag: "two" });

    const database = new Database(catalogPath, { readonly: true });
    try {
      expect(database.prepare("select count(*) as count from snapshots").get()).toEqual({ count: 1 });
      expect(database.prepare("select layer_id, scope_type, scope_code from installed_coverage").all()).toEqual([
        { layer_id: "A00", scope_code: "PL", scope_type: "country" },
      ]);
    } finally {
      database.close();
    }
  });

  it("deduplicates open-ended snapshots and points coverage at the latest metadata", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "prg-sync-metadata-null-"));
    const { catalogPath } = initializePrgDatabases({ addressShardCodes: ["14"], dataDir });
    const store = createSqliteSnapshotStore(catalogPath);
    const metadata: SnapshotMetadata = {
      adapterVersion: "wfs-2", checkedAt: "2026-06-23T00:00:00.000Z", datasetKey: "current:A01",
      downloadedAt: "2026-06-23T00:00:00.000Z", recordCount: 1, schemaFingerprint: "schema",
      scope: "country:PL", sha256: "abc", sourceUrl: "https://example.test/wfs",
    };
    const layer = getPrgLayer("A01");
    if (!layer) throw new Error("Missing test layer.");
    const target = { datasetKey: metadata.datasetKey, estimatedDiskBytes: 1, estimatedDownloadBytes: 1, layer, scope: { code: "PL", type: "country" as const } };

    await store.save(metadata, target);
    await store.save({ ...metadata, checkedAt: "2026-06-24T00:00:00.000Z", recordCount: 2, sha256: "def" }, target);

    expect(await store.find(metadata.datasetKey, metadata.scope)).toEqual({
      ...metadata,
      checkedAt: "2026-06-24T00:00:00.000Z",
      recordCount: 2,
      sha256: "def",
    });

    const database = new Database(catalogPath, { readonly: true });
    try {
      expect(database.prepare("select count(*) as count from snapshots").get()).toEqual({ count: 1 });
      expect(database.prepare("select count(*) as count from installed_coverage").get()).toEqual({ count: 1 });
    } finally {
      database.close();
    }
  });
});
