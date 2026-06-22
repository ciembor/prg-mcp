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
});
