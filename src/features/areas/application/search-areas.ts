import Database from "better-sqlite3";

import type { PrgConfig } from "../../../runtime/config.js";
import { assertDataInstalled, databaseTableHasRows } from "../../../shared/data-result.js";
import { normalizeAreaSearchText, searchAreaNames } from "../../search/index.js";
import { getPrgLayer, listPrgLayers, prgLayerCategories, type PrgLayerCategory } from "../../source-catalog/index.js";
import { toAreaSummary, whereValidOnClause, type AreaRow, type AreaSummary } from "./area-model.js";

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
  assertDataInstalled(
    databaseTableHasRows(config, "boundaries.sqlite", "areas"),
    "PRG boundary data is not installed.",
    "Data synchronization is not packaged in this build; prepare PRG boundary data with a configured import pipeline for profile administrative.",
  );

  if (input.layerId && !getPrgLayer(input.layerId)) {
    return { areas: [] };
  }

  if (input.category && !prgLayerCategories.includes(input.category)) {
    return { areas: [] };
  }

  const database = new Database(`${config.dataDir}/boundaries.sqlite`, { readonly: true });

  try {
    const rows = input.query
      ? searchByText(database, input)
      : searchByFilters(database, input);

    return {
      areas: rows.map(toAreaSummary),
    };
  } finally {
    database.close();
  }
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
      normalizedCode: input.code ? normalizeAreaSearchText(input.code) : null,
      snapshotId: input.snapshotId ?? null,
      validOn: input.validOn ?? null,
    }) as AreaRow[];
}

function filtersSql(input: SearchAreasInput): string {
  return `
    and (@snapshotId is null or snapshot_id = @snapshotId)
    and (@layerId is null or layer_id = @layerId)
    ${categorySql(input.category)}
    and (@code is null or lower(coalesce(code, '')) = lower(@code) or normalized_name = @normalizedCode)
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
    .filter((layer) => layer.category === category)
    .map((layer) => layer.layerId);
}
