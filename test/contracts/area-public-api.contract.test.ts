import { describe, expect, expectTypeOf, it } from "vitest";

import {
  AreaToolError,
  decodeAreaId,
  encodeAreaId,
  type AreaGeometryResult,
  type AreaIdentifier,
  type AreaSummary,
  type AreaWithGeometry,
  type LocatePointInput,
  type LocatePointResult,
  type RelateAreasInput,
  type RelateAreasResult,
  type SearchAreasInput,
  type SearchAreasResult,
} from "../../src/features/areas/index.js";
import type { PrgGeometry } from "../../src/features/spatial/index.js";

describe("area public API", () => {
  it("keeps exported identifiers, errors and use-case DTOs stable", () => {
    const identifier: AreaIdentifier = { layerId: "A03", objectId: "1408032", snapshotId: 1 };
    const areaId = encodeAreaId(identifier);

    expect(decodeAreaId(areaId)).toEqual(identifier);
    expect(new AreaToolError("AREA_NOT_FOUND", "missing")).toMatchObject({ code: "AREA_NOT_FOUND" });
    expectTypeOf<AreaSummary>().toMatchTypeOf<{ areaId: string; layerId: string; snapshotId: number }>();
    expectTypeOf<AreaWithGeometry>().toMatchTypeOf<AreaSummary & { geometry: PrgGeometry }>();
    expectTypeOf<AreaGeometryResult>().toMatchTypeOf<{ crs: "EPSG:2180"; geometry: PrgGeometry }>();
    expectTypeOf<SearchAreasInput>().toMatchTypeOf<{ query?: string; snapshotId?: number }>();
    expectTypeOf<SearchAreasResult>().toMatchTypeOf<{ areas: readonly AreaSummary[] }>();
    expectTypeOf<LocatePointInput>().toMatchTypeOf<{ x: number; y: number }>();
    expectTypeOf<LocatePointResult>().toMatchTypeOf<{ matches: readonly AreaSummary[] }>();
    expectTypeOf<RelateAreasInput>().toMatchTypeOf<{ areaId: string }>();
    expectTypeOf<RelateAreasResult>().toMatchTypeOf<{ sourceArea: AreaSummary; matches: readonly AreaSummary[] }>();
  });
});
