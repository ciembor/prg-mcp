import Database from "better-sqlite3";

import type { PrgConfig } from "../../../runtime/config.js";
import { assertDataInstalled, databaseTableHasRows } from "../../../shared/data-result.js";
import { searchAreaNames } from "../../search/index.js";
import { getPrgLayer, listPrgLayers, prgLayerCategories, type PrgLayerCategory } from "../../source-catalog/index.js";
import { AreaToolError, assertValidOn, toAreaSummary, whereValidOnClause, type AreaRow, type AreaSummary } from "./area-model.js";

export type SearchAreasInput = {
  readonly query?: string;
  readonly category?: PrgLayerCategory;
  readonly layerId?: string;
  readonly code?: string;
  readonly validOn?: string;
  readonly snapshotId?: number;
  readonly limit?: number;
};

export type SearchAreasResult = {
  readonly areas: readonly AreaSummary[];
};

export async function searchAreas(config: PrgConfig, input: SearchAreasInput): Promise<SearchAreasResult> {
  validateSearchAreasInput(input);
  assertDataInstalled(
    databaseTableHasRows(config, "boundaries.sqlite", "areas"),
    "PRG boundary data is not installed.",
    "Data synchronization is not packaged in this build; prepare PRG boundary data with a configured import pipeline for profile administrative.",
  );

  const database = new Database(`${config.dataDir}/boundaries.sqlite`, { readonly: true });

  try {
    const rows = searchRows(database, input);

    return {
      areas: rows.map(toAreaSummary),
    };
  } finally {
    database.close();
  }
}

function searchRows(database: Database.Database, input: SearchAreasInput): AreaRow[] {
  if (!input.query) {
    return searchByFilters(database, input);
  }

  return searchByText(database, input);
}

function searchByText(database: Database.Database, input: SearchAreasInput): AreaRow[] {
  const limit = Math.min(input.limit ?? 20, 100);
  const layerIds = input.category ? layerIdsForCategory(input.category) : undefined;
  const matches = searchAreaNames(database, {
    code: input.code,
      layerId: input.layerId,
      layerIds,
      limit,
      query: input.query ?? "",
      useLatestSnapshotPerLayer: input.snapshotId === undefined,
      snapshotId: input.snapshotId,
      validOn: input.validOn,
  });

  if (matches.length === 0) {
    return [];
  }

  const rowids = matches.map((match) => match.rowid);
  const placeholders = rowids.map((_, index) => `@rowid${index}`).join(", ");
  const parameters = Object.fromEntries(rowids.map((rowid, index) => [`rowid${index}`, rowid]));
  const rows = database
    .prepare(`
      select *
      from areas
      where rowid in (${placeholders})
      order by case rowid ${rowids.map((rowid, index) => `when ${rowid} then ${index}`).join(" ")} end
    `)
    .all(parameters) as AreaRow[];

  return rows;
}

function searchByFilters(database: Database.Database, input: SearchAreasInput): AreaRow[] {
  if (!input.code && !input.layerId && !input.category) {
    return [];
  }

  return database
    .prepare(`
      select *
      from areas
      where 1 = 1
        ${filtersSql(input)}
      order by
        layer_id asc,
        coalesce(name, '') collate nocase asc,
        object_id asc,
        rowid asc
      limit @limit
    `)
    .all({
      code: input.code ?? null,
      layerId: input.layerId ?? null,
      limit: Math.min(input.limit ?? 20, 100),
      snapshotId: input.snapshotId ?? null,
      validOn: input.validOn ?? null,
    }) as AreaRow[];
}

function filtersSql(input: SearchAreasInput): string {
  return `
    and (@snapshotId is null or snapshot_id = @snapshotId)
    ${input.snapshotId === undefined ? "and snapshot_id = (select max(latest.snapshot_id) from areas latest where latest.layer_id = areas.layer_id)" : ""}
    and (@layerId is null or layer_id = @layerId)
    ${categorySql(input.category)}
    and (@code is null or lower(coalesce(code, '')) = lower(@code))
    ${whereValidOnClause(input.validOn)}
  `;
}

function categorySql(category: PrgLayerCategory | undefined): string {
  if (!category) {
    return "";
  }

  const layerIds = layerIdsForCategory(category).map((layerId) => `'${layerId.replaceAll("'", "''")}'`);

  if (layerIds.length === 0) {
    return "and 1 = 0";
  }

  return `and layer_id in (${layerIds.join(", ")})`;
}

function layerIdsForCategory(category: PrgLayerCategory): string[] {
  return listPrgLayers()
    .filter((layer) => layer.category === category && layer.sourceChannel === "wfs")
    .map((layer) => layer.layerId);
}

const areaLayerCategories = prgLayerCategories.filter((category) => category !== "address");

function validateSearchAreasInput(input: SearchAreasInput): void {
  if (input.limit !== undefined && (!Number.isInteger(input.limit) || input.limit < 1)) {
    throw new AreaToolError("INVALID_INPUT", "search_areas limit must be a positive integer.");
  }

  if (!input.query && !input.code && !input.layerId && !input.category) {
    throw new AreaToolError("INVALID_INPUT", "search_areas requires query, code, layerId or category.");
  }

  assertValidOn("search_areas", input.validOn);

  if (input.layerId !== undefined && !isAreaLayerId(input.layerId)) {
    throw new AreaToolError("INVALID_INPUT", "search_areas layerId must refer to a PRG area layer.");
  }

  if (input.category !== undefined && !isAreaLayerCategory(input.category)) {
    throw new AreaToolError("INVALID_INPUT", "search_areas category must refer to PRG area layers.");
  }
}

function isAreaLayerId(layerId: string): boolean {
  return getPrgLayer(layerId)?.sourceChannel === "wfs";
}

function isAreaLayerCategory(category: PrgLayerCategory): boolean {
  return (areaLayerCategories as readonly PrgLayerCategory[]).includes(category);
}
