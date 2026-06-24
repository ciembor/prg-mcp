import Database from "better-sqlite3";

import type { PrgConfig } from "../../../runtime/config.js";
import { assertDataInstalled, databaseFileExists } from "../../../shared/data-result.js";
import { decodeWkb } from "../../spatial/index.js";
import { pointCoveredByPolygon } from "../../spatial/infrastructure/turf/geometry-predicates.js";
import type { MultiPolygonGeometry, PolygonGeometry } from "../../spatial/index.js";
import { listPrgLayers, type PrgLayerCategory } from "../../source-catalog/index.js";
import { toAreaSummary, type AreaRow, type AreaSummary } from "./area-model.js";

export type LocatePointInput = {
  readonly x: number;
  readonly y: number;
  readonly layerIds?: readonly string[];
  readonly category?: PrgLayerCategory;
  readonly snapshotId?: number;
  readonly validOn?: string;
  readonly limit?: number;
};

export type LocatePointResult = {
  readonly point: readonly [number, number];
  readonly matches: readonly AreaSummary[];
};

export async function locatePoint(config: PrgConfig, input: LocatePointInput): Promise<LocatePointResult> {
  assertDataInstalled(databaseFileExists(config, "boundaries.sqlite"), "PRG boundary data is not installed.", "prg-mcp sync --profile administrative --mode missing");
  const database = new Database(`${config.dataDir}/boundaries.sqlite`, { readonly: true });

  try {
    const rows = database
      .prepare(`
        select areas.*
        from areas_rtree
        join areas on areas.rowid = areas_rtree.rowid
        where @x between areas_rtree.min_x and areas_rtree.max_x
          and @y between areas_rtree.min_y and areas_rtree.max_y
          and (@snapshotId is null or areas.snapshot_id = @snapshotId)
          and (@layerIdsCsv is null or instr(',' || @layerIdsCsv || ',', ',' || areas.layer_id || ',') > 0)
          and (@categoryLayerIdsCsv is null or instr(',' || @categoryLayerIdsCsv || ',', ',' || areas.layer_id || ',') > 0)
          and (@validOn is null or areas.valid_from is null or areas.valid_from <= @validOn)
          and (@validOn is null or areas.valid_to is null or areas.valid_to >= @validOn)
        order by areas.layer_id asc, coalesce(areas.name, '') collate nocase asc, areas.object_id asc
        limit @candidateLimit
      `)
      .all({
        candidateLimit: Math.min((input.limit ?? 20) * 20, 2_000),
        categoryLayerIdsCsv: layerIdsForCategory(input.category),
        layerIdsCsv: input.layerIds && input.layerIds.length > 0 ? input.layerIds.join(",") : null,
        snapshotId: input.snapshotId ?? null,
        validOn: input.validOn ?? null,
        x: input.x,
        y: input.y,
      }) as AreaRow[];

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

function layerIdsForCategory(category: PrgLayerCategory | undefined): string | null {
  if (!category) return null;
  const layerIds = listPrgLayers()
    .filter((layer) => layer.category === category)
    .map((layer) => layer.layerId);

  return layerIds.length === 0 ? "__none__" : layerIds.join(",");
}
