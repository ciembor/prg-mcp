import { existsSync } from "node:fs";
import { join } from "node:path";

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

type AreaCurrentSnapshot = {
  readonly layerId: string;
  readonly snapshotId: number;
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
    const currentSnapshots = input.snapshotId === undefined ? readCurrentAreaSnapshots(config, layerIdsForInput(input)) : [];
    installCurrentSnapshotTable(database, currentSnapshots);
    const rows = searchRows(database, input, currentSnapshots);

    return {
      areas: rows.map(toAreaSummary),
    };
  } finally {
    database.close();
  }
}

function searchRows(database: Database.Database, input: SearchAreasInput, currentSnapshots: readonly AreaCurrentSnapshot[]): AreaRow[] {
  if (!input.query) {
    return searchByFilters(database, input, currentSnapshots);
  }

  return searchByText(database, input, currentSnapshots);
}

function searchByText(database: Database.Database, input: SearchAreasInput, currentSnapshots: readonly AreaCurrentSnapshot[]): AreaRow[] {
  const limit = Math.min(input.limit ?? 20, 100);
  const layerIds = input.category ? layerIdsForCategory(input.category) : undefined;
  const matches = searchAreaNames(database, {
    code: input.code,
      currentSnapshots,
      layerId: input.layerId,
      layerIds,
      limit,
      query: input.query ?? "",
      useLatestSnapshotPerLayer: input.snapshotId === undefined && currentSnapshots.length === 0,
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

function searchByFilters(database: Database.Database, input: SearchAreasInput, currentSnapshots: readonly AreaCurrentSnapshot[]): AreaRow[] {
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
      useCurrentSnapshotTable: currentSnapshots.length > 0 ? 1 : 0,
      useLatestSnapshotPerLayer: input.snapshotId === undefined && currentSnapshots.length === 0 ? 1 : 0,
      validOn: input.validOn ?? null,
    }) as AreaRow[];
}

function filtersSql(input: SearchAreasInput): string {
  return `
    and (@snapshotId is null or snapshot_id = @snapshotId)
    and (@useCurrentSnapshotTable = 0 or exists (
      select 1
      from temp.current_area_snapshots current
      where current.layer_id = areas.layer_id
        and current.snapshot_id = areas.snapshot_id
    ))
    and (@useLatestSnapshotPerLayer = 0 or snapshot_id = (select max(latest.snapshot_id) from areas latest where latest.layer_id = areas.layer_id))
    and (@layerId is null or layer_id = @layerId)
    ${categorySql(input.category)}
    and (@code is null or lower(coalesce(code, '')) = lower(@code))
    ${whereValidOnClause(input.validOn)}
  `;
}

function installCurrentSnapshotTable(database: Database.Database, currentSnapshots: readonly AreaCurrentSnapshot[]): void {
  database.exec(`
    create temp table if not exists current_area_snapshots (
      layer_id text primary key,
      snapshot_id integer not null
    );
    delete from temp.current_area_snapshots;
  `);

  const insert = database.prepare("insert into temp.current_area_snapshots(layer_id, snapshot_id) values (@layerId, @snapshotId)");
  for (const snapshot of currentSnapshots) {
    insert.run(snapshot);
  }
}

function layerIdsForInput(input: SearchAreasInput): readonly string[] {
  if (input.layerId) {
    return [input.layerId];
  }

  if (input.category) {
    return layerIdsForCategory(input.category);
  }

  return listPrgLayers()
    .filter((layer) => layer.sourceChannel === "wfs")
    .map((layer) => layer.layerId);
}

function readCurrentAreaSnapshots(config: PrgConfig, layerIds: readonly string[]): readonly AreaCurrentSnapshot[] {
  const catalogPath = join(config.dataDir, "catalog.sqlite");
  if (layerIds.length === 0 || !existsSync(catalogPath)) {
    return [];
  }

  const database = new Database(catalogPath, { fileMustExist: true, readonly: true });
  try {
    installRequestedLayerTable(database, layerIds);
    return database.prepare(`
      select c.layer_id as layerId, c.snapshot_id as snapshotId
      from installed_coverage c
      join temp.requested_area_layers requested on requested.layer_id = c.layer_id
      where 1 = 1
        and c.dataset_key = 'current:' || c.layer_id
        and c.archive_year = 0
        and c.scope_type = 'country'
        and c.scope_code = 'PL'
        and c.completeness = 'complete'
      order by c.layer_id asc
    `).all() as AreaCurrentSnapshot[];
  } finally {
    database.close();
  }
}

function installRequestedLayerTable(database: Database.Database, layerIds: readonly string[]): void {
  database.exec(`
    create temp table if not exists requested_area_layers (
      layer_id text primary key
    );
    delete from temp.requested_area_layers;
  `);

  const insert = database.prepare("insert into temp.requested_area_layers(layer_id) values (?)");
  for (const layerId of layerIds) {
    insert.run(layerId);
  }
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
