import { describe, expect, it, vi } from "vitest";

import { planSync, runSyncPlan, type SnapshotMetadata, type StagedPublication } from "../../../src/features/synchronization/index.js";

describe("synchronization orchestration", () => {
  it("publishes validated targets and rolls back only a failed staging unit", async () => {
    const plan = planSync({ availableDiskBytes: 10 ** 12, layerIds: ["A00", "A01"], mode: "force" });
    const saved: SnapshotMetadata[] = [];
    const rollback = vi.fn(async () => undefined);
    const result = await runSyncPlan(plan, {
      publisher: {
        publish: async (publication) => { if (publication.target.layer.layerId === "A01") throw new Error("publish failed"); },
        rollback,
        stage: async (target) => ({ id: target.layer.layerId, target }),
      },
      snapshots: { find: async () => undefined, save: async (metadata) => { saved.push(metadata); } },
      source: {
        probe: async () => ({ checkedAt: "2026-06-23T00:00:00.000Z", sourceUrl: "https://example.test", status: "available" }),
        download: async (target) => ({
          adapterVersion: "wfs-1", bytes: new Uint8Array([1, 2, 3]),
          records: [{ bbox: [100_000, 100_000, 200_000, 200_000], crs: "EPSG:2180", objectId: target.layer.layerId, recordType: "area" }],
          schemaFingerprint: "schema", sourceUrl: "https://example.test", stateDate: "2026-06-22",
        }),
      },
      now: () => new Date("2026-06-23T00:00:00.000Z"),
    });

    expect(result.status).toBe("partial");
    expect(result.targets.map((target) => target.status)).toEqual(["published", "failed"]);
    expect(saved).toHaveLength(1);
    expect(rollback).toHaveBeenCalledWith(expect.objectContaining({ id: "A01" }) satisfies Partial<StagedPublication>);
    expect(saved[0]?.sha256).toHaveLength(64);
  });

  it("does not fail or roll back a published database after catalog metadata is saved when finalize cleanup fails", async () => {
    const plan = planSync({ availableDiskBytes: 10 ** 12, layerIds: ["A00"], mode: "force" });
    const rollback = vi.fn(async () => undefined);
    const saved: SnapshotMetadata[] = [];
    const result = await runSyncPlan(plan, {
      publisher: {
        finalize: async () => { throw new Error("cleanup failed"); },
        publish: async () => undefined,
        rollback,
        stage: async (target) => ({ id: target.layer.layerId, target }),
      },
      snapshots: { find: async () => undefined, save: async (metadata) => { saved.push(metadata); } },
      source: {
        probe: async () => ({ checkedAt: "2026-06-23T00:00:00.000Z", sourceUrl: "https://example.test", status: "available" }),
        download: async (target) => ({
          adapterVersion: "wfs-1", bytes: new Uint8Array([1]),
          records: [{ bbox: [100_000, 100_000, 200_000, 200_000], crs: "EPSG:2180", objectId: target.layer.layerId, recordType: "area" }],
          schemaFingerprint: "schema", sourceUrl: "https://example.test",
        }),
      },
      now: () => new Date("2026-06-23T00:00:00.000Z"),
    });

    expect(result.targets).toEqual([expect.objectContaining({ status: "published" })]);
    expect(saved).toHaveLength(1);
    expect(rollback).not.toHaveBeenCalled();
  });

  it("does not probe remote sources for missing mode targets that already have snapshots", async () => {
    const plan = planSync({ availableDiskBytes: 10 ** 12, layerIds: ["A00"], mode: "missing" });
    const probe = vi.fn(async () => ({ checkedAt: "2026-06-23T00:00:00.000Z", sourceUrl: "https://example.test", status: "unavailable" as const }));
    const result = await runSyncPlan(plan, {
      publisher: {
        publish: async () => undefined,
        rollback: async () => undefined,
        stage: async (target) => ({ id: target.layer.layerId, target }),
      },
      snapshots: {
        find: async (datasetKey, scope) => ({
          adapterVersion: "1", checkedAt: "2026-06-23T00:00:00.000Z", datasetKey,
          downloadedAt: "2026-06-23T00:00:00.000Z", recordCount: 1, schemaFingerprint: "schema",
          scope, sha256: "abc", sourceUrl: "https://example.test",
        }),
        save: async () => undefined,
      },
      source: {
        download: async () => { throw new Error("download should not run"); },
        probe,
      },
    });

    expect(result.targets).toEqual([expect.objectContaining({ status: "unchanged" })]);
    expect(probe).not.toHaveBeenCalled();
  });

  it("refreshes stale unchanged snapshots without downloading the dataset", async () => {
    const plan = planSync({ availableDiskBytes: 10 ** 12, layerIds: ["A00"], mode: "stale" });
    const saved: SnapshotMetadata[] = [];
    const stage = vi.fn(async (target) => ({ id: target.layer.layerId, target }));
    const result = await runSyncPlan(plan, {
      publisher: {
        publish: async () => undefined,
        rollback: async () => undefined,
        stage,
      },
      snapshots: {
        find: async (datasetKey, scope) => ({
          adapterVersion: "1", checkedAt: "2026-06-20T00:00:00.000Z", datasetKey,
          downloadedAt: "2026-06-20T00:00:00.000Z", etag: "etag-1", lastModified: "Mon, 22 Jun 2026 00:00:00 GMT",
          recordCount: 1, schemaFingerprint: "schema", scope, sha256: "abc", sourceUrl: "https://example.test/old",
        }),
        save: async (metadata) => { saved.push(metadata); },
      },
      source: {
        download: async () => { throw new Error("download should not run"); },
        probe: async () => ({
          checkedAt: "2026-06-23T00:00:00.000Z",
          etag: "etag-1",
          lastModified: "Mon, 22 Jun 2026 00:00:00 GMT",
          sourceUrl: "https://example.test/current",
          status: "available",
        }),
      },
      now: () => new Date("2026-06-23T00:00:00.000Z"),
    });

    expect(result.targets).toEqual([expect.objectContaining({ status: "unchanged" })]);
    expect(stage).not.toHaveBeenCalled();
    expect(saved).toEqual([
      expect.objectContaining({
        checkedAt: "2026-06-23T00:00:00.000Z",
        downloadedAt: "2026-06-20T00:00:00.000Z",
        sourceUrl: "https://example.test/current",
      }),
    ]);
  });
});
