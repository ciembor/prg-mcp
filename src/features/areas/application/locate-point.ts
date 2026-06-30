import Database from "better-sqlite3";

import type { PrgConfig } from "../../../runtime/config.js";
import { assertDataInstalled, databaseTableHasRows } from "../../../shared/data-result.js";
import { decodeWkb } from "../../spatial/index.js";
import { pointCoveredByPolygon } from "../../spatial/infrastructure/turf/geometry-predicates.js";
import type { MultiPolygonGeometry, PolygonGeometry } from "../../spatial/index.js";
import { getPrgLayer, listPrgLayers, type PrgLayerCategory } from "../../source-catalog/index.js";
import { AreaToolError, assertValidOn, toAreaSummary, type AreaRow, type AreaSummary } from "./area-model.js";

export type LocatePointInput = {
  readonly x: number;
  readonly y: number;
  readonly layerIds?: readonly string[];
  readonly category?: PrgLayerCategory;
  readonly snapshotId?: number;
  readonly validOn?: string;
  readonly limit?: number;
  readonly maxCandidates?: number;
};

export type LocatePointResult = {
  readonly point: readonly [number, number];
  readonly matches: readonly AreaSummary[];
};

export async function locatePoint(config: PrgConfig, input: LocatePointInput): Promise<LocatePointResult> {
  validateLocatePointInput(input);
  assertDataInstalled(
    databaseTableHasRows(config, "boundaries.sqlite", "areas") && databaseTableHasRows(config, "boundaries.sqlite", "areas_rtree"),
    "PRG boundary data or spatial index is not installed.",
    "Data synchronization is not packaged in this build; prepare PRG boundary data with a configured import pipeline for profile administrative.",
  );
  const database = new Database(`${config.dataDir}/boundaries.sqlite`, { readonly: true });

  try {
    const maxCandidates = Math.min(input.maxCandidates ?? 2_000, 10_000);
    const count = database
      .prepare(`
        select count(*) as count
        from areas_rtree
        join areas on areas.rowid = areas_rtree.rowid
        where @x between areas_rtree.min_x and areas_rtree.max_x
          and @y between areas_rtree.min_y and areas_rtree.max_y
          and (@snapshotId is null or areas.snapshot_id = @snapshotId)
          and instr(',' || @polygonLayerIdsCsv || ',', ',' || areas.layer_id || ',') > 0
          and (@layerIdsCsv is null or instr(',' || @layerIdsCsv || ',', ',' || areas.layer_id || ',') > 0)
          and (@categoryLayerIdsCsv is null or instr(',' || @categoryLayerIdsCsv || ',', ',' || areas.layer_id || ',') > 0)
          and (@validOn is null or areas.valid_from is null or areas.valid_from <= @validOn)
          and (@validOn is null or areas.valid_to is null or areas.valid_to >= @validOn)
      `)
      .get(parameters(input)) as { count: number };

    if (count.count > maxCandidates) {
      throw new AreaToolError("COST_LIMIT_EXCEEDED", `Point location would inspect ${count.count} candidates; limit is ${maxCandidates}.`);
    }

    const rows = database
      .prepare(`
        select areas.*
        from areas_rtree
        join areas on areas.rowid = areas_rtree.rowid
        where @x between areas_rtree.min_x and areas_rtree.max_x
          and @y between areas_rtree.min_y and areas_rtree.max_y
          and (@snapshotId is null or areas.snapshot_id = @snapshotId)
          and instr(',' || @polygonLayerIdsCsv || ',', ',' || areas.layer_id || ',') > 0
          and (@layerIdsCsv is null or instr(',' || @layerIdsCsv || ',', ',' || areas.layer_id || ',') > 0)
          and (@categoryLayerIdsCsv is null or instr(',' || @categoryLayerIdsCsv || ',', ',' || areas.layer_id || ',') > 0)
          and (@validOn is null or areas.valid_from is null or areas.valid_from <= @validOn)
          and (@validOn is null or areas.valid_to is null or areas.valid_to >= @validOn)
        order by areas.layer_id asc, coalesce(areas.name, '') collate nocase asc, areas.object_id asc
      `)
      .all(parameters(input)) as AreaRow[];

    const matches = rows
      .filter((row) => {
        const geometry = decodeWkb(row.geometry_wkb);

        if (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon") {
          return false;
        }

        return pointCoveredByPolygon([input.x, input.y], geometry as PolygonGeometry | MultiPolygonGeometry);
      })
      .slice(0, Math.min(input.limit ?? 20, 100))
      .map(toAreaSummary);

    return { matches, point: [input.x, input.y] };
  } finally {
    database.close();
  }
}

function validateLocatePointInput(input: LocatePointInput): void {
  if (!Number.isFinite(input.x) || !Number.isFinite(input.y)) {
    throw new AreaToolError("INVALID_INPUT", "locate_point coordinates must be finite numbers.");
  }

  if (input.limit !== undefined && (!Number.isInteger(input.limit) || input.limit < 1)) {
    throw new AreaToolError("INVALID_INPUT", "locate_point limit must be a positive integer.");
  }

  if (input.maxCandidates !== undefined && (!Number.isInteger(input.maxCandidates) || input.maxCandidates < 1)) {
    throw new AreaToolError("INVALID_INPUT", "locate_point maxCandidates must be a positive integer.");
  }

  assertValidOn("locate_point", input.validOn);
  validateAreaCategory("locate_point", input.category);
  validateAreaLayerIds("locate_point", input.layerIds);
}

function parameters(input: LocatePointInput): Record<string, unknown> {
  return {
    categoryLayerIdsCsv: layerIdsForCategory(input.category),
    layerIdsCsv: input.layerIds && input.layerIds.length > 0 ? input.layerIds.join(",") : null,
    polygonLayerIdsCsv: polygonLayerIds().join(","),
    snapshotId: input.snapshotId ?? null,
    validOn: input.validOn ?? null,
    x: input.x,
    y: input.y,
  };
}

function polygonLayerIds(): readonly string[] {
  return listPrgLayers()
    .filter((layer) => layer.sourceChannel === "wfs" && layer.geometryType === "polygon")
    .map((layer) => layer.layerId);
}

function layerIdsForCategory(category: PrgLayerCategory | undefined): string | null {
  if (!category) return null;
  const layerIds = listPrgLayers()
    .filter((layer) => layer.category === category && layer.sourceChannel === "wfs")
    .map((layer) => layer.layerId);

  return layerIds.length === 0 ? "__none__" : layerIds.join(",");
}

function validateAreaCategory(toolName: string, category: PrgLayerCategory | undefined): void {
  if (category === "address") {
    throw new AreaToolError("INVALID_INPUT", `${toolName} category must refer to PRG area layers.`);
  }
}

function validateAreaLayerIds(toolName: string, layerIds: readonly string[] | undefined): void {
  for (const layerId of layerIds ?? []) {
    const layer = getPrgLayer(layerId);
    if (!layer || layer.sourceChannel !== "wfs" || layer.geometryType !== "polygon") {
      throw new AreaToolError("INVALID_INPUT", `${toolName} layerIds must contain only PRG polygon area layers.`);
    }
  }
}
