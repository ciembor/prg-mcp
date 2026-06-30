import Database from "better-sqlite3";

import type { PrgConfig } from "../../../runtime/config.js";
import { assertDataInstalled, databaseTableHasRows } from "../../../shared/data-result.js";
import { decodeWkb } from "../../spatial/index.js";
import { geometriesIntersect } from "../../spatial/infrastructure/turf/geometry-predicates.js";
import { getPrgLayer, listPrgLayers, type PrgLayerCategory } from "../../source-catalog/index.js";
import { AreaToolError, readAreaById, toAreaSummary, type AreaRow, type AreaSummary } from "./area-model.js";

export type RelateAreasInput = {
  readonly areaId: string;
  readonly layerIds?: readonly string[];
  readonly category?: PrgLayerCategory;
  readonly snapshotId?: number;
  readonly validOn?: string;
  readonly limit?: number;
  readonly maxCandidates?: number;
};

export type RelateAreasResult = {
  readonly source: AreaSummary;
  readonly relation: "intersects";
  readonly matches: readonly AreaSummary[];
};

export async function relateAreas(config: PrgConfig, input: RelateAreasInput): Promise<RelateAreasResult> {
  validateRelateAreasInput(input);
  assertDataInstalled(
    databaseTableHasRows(config, "boundaries.sqlite", "areas") && databaseTableHasRows(config, "boundaries.sqlite", "areas_rtree"),
    "PRG boundary data or spatial index is not installed.",
    "Data synchronization is not packaged in this build; prepare PRG boundary data with a configured import pipeline for profile administrative.",
  );
  const database = new Database(`${config.dataDir}/boundaries.sqlite`, { readonly: true });

  try {
    const sourceRow = readAreaById(database, input.areaId);
    if (input.snapshotId !== undefined && input.snapshotId !== sourceRow.snapshot_id) {
      throw new AreaToolError(
        "SNAPSHOT_MISMATCH",
        `relate_areas snapshotId ${input.snapshotId} does not match source area snapshot ${sourceRow.snapshot_id}.`,
      );
    }
    const maxCandidates = Math.min(input.maxCandidates ?? 1_000, 10_000);
    const count = database
      .prepare(`
        select count(*) as count
        from areas_rtree
        join areas on areas.rowid = areas_rtree.rowid
        where areas_rtree.min_x <= @maxX
          and areas_rtree.max_x >= @minX
          and areas_rtree.min_y <= @maxY
          and areas_rtree.max_y >= @minY
          and not (areas.snapshot_id = @sourceSnapshotId and areas.layer_id = @sourceLayerId and areas.object_id = @sourceObjectId)
          and (@snapshotId is null or areas.snapshot_id = @snapshotId)
          and (@layerIdsCsv is null or instr(',' || @layerIdsCsv || ',', ',' || areas.layer_id || ',') > 0)
          and (@categoryLayerIdsCsv is null or instr(',' || @categoryLayerIdsCsv || ',', ',' || areas.layer_id || ',') > 0)
          and (@validOn is null or areas.valid_from is null or areas.valid_from <= @validOn)
          and (@validOn is null or areas.valid_to is null or areas.valid_to >= @validOn)
      `)
      .get(parameters(sourceRow, input)) as { count: number };

    if (count.count > maxCandidates) {
      throw new AreaToolError("COST_LIMIT_EXCEEDED", `Relation scan would inspect ${count.count} candidates; limit is ${maxCandidates}.`);
    }

    const candidates = database
      .prepare(`
        select areas.*
        from areas_rtree
        join areas on areas.rowid = areas_rtree.rowid
        where areas_rtree.min_x <= @maxX
          and areas_rtree.max_x >= @minX
          and areas_rtree.min_y <= @maxY
          and areas_rtree.max_y >= @minY
          and not (areas.snapshot_id = @sourceSnapshotId and areas.layer_id = @sourceLayerId and areas.object_id = @sourceObjectId)
          and (@snapshotId is null or areas.snapshot_id = @snapshotId)
          and (@layerIdsCsv is null or instr(',' || @layerIdsCsv || ',', ',' || areas.layer_id || ',') > 0)
          and (@categoryLayerIdsCsv is null or instr(',' || @categoryLayerIdsCsv || ',', ',' || areas.layer_id || ',') > 0)
          and (@validOn is null or areas.valid_from is null or areas.valid_from <= @validOn)
          and (@validOn is null or areas.valid_to is null or areas.valid_to >= @validOn)
        order by areas.layer_id asc, coalesce(areas.name, '') collate nocase asc, areas.object_id asc
      `)
      .all(parameters(sourceRow, input)) as AreaRow[];

    const sourceGeometry = decodeWkb(sourceRow.geometry_wkb);
    const matches = candidates
      .filter((candidate) => geometriesIntersect(sourceGeometry, decodeWkb(candidate.geometry_wkb)))
      .slice(0, Math.min(input.limit ?? 20, 100))
      .map(toAreaSummary);

    return {
      matches,
      relation: "intersects",
      source: toAreaSummary(sourceRow),
    };
  } finally {
    database.close();
  }
}

function validateRelateAreasInput(input: RelateAreasInput): void {
  if (!input.category && (!input.layerIds || input.layerIds.length === 0)) {
    throw new AreaToolError("UNBOUNDED_SCAN_REFUSED", "relate_areas requires layerIds or category to avoid an unbounded relation scan.");
  }

  if (input.limit !== undefined && (!Number.isInteger(input.limit) || input.limit < 1)) {
    throw new AreaToolError("INVALID_INPUT", "relate_areas limit must be a positive integer.");
  }

  if (input.maxCandidates !== undefined && (!Number.isInteger(input.maxCandidates) || input.maxCandidates < 1)) {
    throw new AreaToolError("INVALID_INPUT", "relate_areas maxCandidates must be a positive integer.");
  }

  validateAreaCategory("relate_areas", input.category);
  validateAreaLayerIds("relate_areas", input.layerIds);
}

function parameters(sourceRow: AreaRow, input: RelateAreasInput): Record<string, unknown> {
  return {
    categoryLayerIdsCsv: layerIdsForCategory(input.category),
    layerIdsCsv: input.layerIds && input.layerIds.length > 0 ? input.layerIds.join(",") : null,
    maxX: sourceRow.max_x,
    maxY: sourceRow.max_y,
    minX: sourceRow.min_x,
    minY: sourceRow.min_y,
    snapshotId: input.snapshotId ?? sourceRow.snapshot_id,
    sourceLayerId: sourceRow.layer_id,
    sourceObjectId: sourceRow.object_id,
    sourceSnapshotId: sourceRow.snapshot_id,
    validOn: input.validOn ?? null,
  };
}

function layerIdsForCategory(category: PrgLayerCategory | undefined): string | null {
  if (!category) {
    return null;
  }

  const layerIds = listPrgLayers()
    .filter((layer) => layer.category === category && layer.sourceChannel === "wfs")
    .map((layer) => layer.layerId);

  if (layerIds.length === 0) {
    throw new AreaToolError("UNBOUNDED_SCAN_REFUSED", "relate_areas requires layerIds or category to avoid an unbounded relation scan.");
  }

  return layerIds.join(",");
}

function validateAreaCategory(toolName: string, category: PrgLayerCategory | undefined): void {
  if (category === "address") {
    throw new AreaToolError("INVALID_INPUT", `${toolName} category must refer to PRG area layers.`);
  }
}

function validateAreaLayerIds(toolName: string, layerIds: readonly string[] | undefined): void {
  for (const layerId of layerIds ?? []) {
    const layer = getPrgLayer(layerId);
    if (!layer || layer.sourceChannel !== "wfs") {
      throw new AreaToolError("INVALID_INPUT", `${toolName} layerIds must contain only PRG area layers.`);
    }
  }
}
