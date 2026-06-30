import { describe, expect, it } from "vitest";

import { planSync, SyncPlanningError } from "../../../src/features/synchronization/index.js";

describe("PRG synchronization planner", () => {
  it("expands profiles, normalizes duplicate scopes and estimates staging space", () => {
    const plan = planSync({
      availableDiskBytes: 20_000_000_000,
      mode: "missing",
      profile: "addresses",
      teryt: ["1465", "1465", "0201011"],
    });

    expect(plan.targets).toHaveLength(4);
    expect(plan.targets.map((target) => [target.layer.layerId, target.scope.code])).toEqual([
      ["A07", "1465"], ["A07", "0201011"], ["A08", "1465"], ["A08", "0201011"],
    ]);
    expect(plan.estimatedDownloadBytes).toBeGreaterThan(0);
    expect(plan.estimatedDiskBytes).toBeGreaterThan(plan.estimatedDownloadBytes);
  });

  it("expands default address scope to voivodeship shards", () => {
    const plan = planSync({ availableDiskBytes: 10 ** 12, mode: "missing", profile: "addresses" });

    expect(plan.targets).toHaveLength(32);
    expect(new Set(plan.targets.map((target) => target.scope.type))).toEqual(new Set(["voivodeship"]));
    expect(plan.targets.filter((target) => target.layer.layerId === "A07")).toHaveLength(16);
  });

  it("rejects invalid TERYT and insufficient free space before synchronization", () => {
    expect(() => planSync({ availableDiskBytes: 10 ** 12, mode: "invalid" as never, profile: "administrative" })).toThrowError(
      expect.objectContaining({ code: "INVALID_MODE" }),
    );
    expect(() => planSync({ availableDiskBytes: 1, mode: "missing", profile: "administrative" })).toThrowError(
      expect.objectContaining({ code: "INSUFFICIENT_DISK_SPACE" }),
    );
    expect(() => planSync({ availableDiskBytes: 10 ** 12, mode: "missing", profile: "addresses", teryt: ["14xx"] })).toThrowError(
      expect.objectContaining({ code: "INVALID_TERYT" }),
    );
    expect(() => planSync({ availableDiskBytes: 10 ** 12, mode: "missing", profile: "addresses", teryt: ["99"] })).toThrowError(
      expect.objectContaining({ code: "INVALID_TERYT" }),
    );
    expect(() => planSync({ availableDiskBytes: 10 ** 12, layerIds: ["A00"], mode: "missing", teryt: ["14"] })).toThrowError(
      expect.objectContaining({ code: "INVALID_TERYT" }),
    );
  });

  it("rejects mixed WFS and address layers when TERYT would silently widen WFS scope", () => {
    expect(() => planSync({ availableDiskBytes: 10 ** 12, layerIds: ["A00", "A07"], mode: "missing", teryt: ["14"] })).toThrowError(
      expect.objectContaining({ code: "INVALID_TERYT" }),
    );

    const full = planSync({ availableDiskBytes: 10 ** 12, mode: "missing", profile: "poland-full" });
    expect(full.targets.some((target) => target.layer.sourceChannel === "wfs" && target.scope.code === "PL")).toBe(true);
    expect(full.targets.filter((target) => target.layer.layerId === "A07")).toHaveLength(16);
    expect(full.targets.filter((target) => target.layer.layerId === "A08")).toHaveLength(16);
  });

  it("plans only catalogued immutable administrative archives", () => {
    const plan = planSync({ availableDiskBytes: 10 ** 12, archiveYear: 2024, mode: "stale", profile: "administrative-history" });
    expect(plan.targets).toHaveLength(5);
    expect(plan.targets.every((target) => target.datasetKey.startsWith("archive:2024:"))).toBe(true);
    expect(() => planSync({ availableDiskBytes: 10 ** 12, archiveYear: 2014, mode: "force", profile: "administrative-history" })).toThrow(SyncPlanningError);
  });
});
