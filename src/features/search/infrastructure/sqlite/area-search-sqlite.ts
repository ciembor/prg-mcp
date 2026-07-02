import type Database from "better-sqlite3";

import {
  normalizeAreaSearchText,
  toAreaFtsQuery,
  toAreaSearchRankBucket,
  type AreaSearchOptions,
  type AreaSearchResult,
} from "../../domain/area-search.js";

type AreaSearchSqlRow = {
  rowid: number;
  snapshot_id: number;
  layer_id: string;
  object_id: string;
  name: string | null;
  normalized_name: string | null;
  code: string | null;
  aliases: string | null;
  rank_bucket: number;
  bm25_score: number;
};

export function rebuildAreaSearchIndex(database: Database.Database): void {
  database.prepare("insert into areas_fts(areas_fts) values ('rebuild')").run();
}

export function searchAreaNames(database: Database.Database, options: AreaSearchOptions): AreaSearchResult[] {
  const normalizedQuery = normalizeAreaSearchText(options.query);
  const ftsQuery = toAreaFtsQuery(normalizedQuery);

  if (!ftsQuery) {
    return [];
  }

  const currentSnapshots = options.currentSnapshots ?? [];
  installCurrentSnapshotTable(database, currentSnapshots);
  const rows = database
    .prepare(searchAreaSql)
    .all({
      code: options.code ?? null,
      codeQuery: options.query.trim().toLowerCase(),
      ftsQuery,
      layerId: options.layerId ?? null,
      layerIdsCsv: options.layerIds && options.layerIds.length > 0 ? options.layerIds.join(",") : null,
      limit: options.limit ?? 20,
      normalizedPrefix: `${escapeLike(normalizedQuery)}%`,
      normalizedQuery,
      snapshotId: options.snapshotId ?? null,
      useCurrentSnapshotTable: currentSnapshots.length > 0 ? 1 : 0,
      useLatestSnapshotPerLayer: options.useLatestSnapshotPerLayer ? 1 : 0,
      validOn: options.validOn ?? null,
    }) as AreaSearchSqlRow[];

  return rows.map(toAreaSearchResult);
}

const searchAreaSql = `
  select
    areas.rowid,
    areas.snapshot_id,
    areas.layer_id,
    areas.object_id,
    areas.name,
    areas.normalized_name,
    areas.code,
    areas.aliases,
    case
      when lower(coalesce(areas.code, '')) = @codeQuery then 0
      when coalesce(areas.normalized_name, '') = @normalizedQuery then 1
      when coalesce(areas.normalized_name, '') like @normalizedPrefix escape '\\' then 2
      else 3
    end as rank_bucket,
    bm25(areas_fts, 5.0, 4.0, 3.0, 1.0) as bm25_score
  from areas_fts
  join areas on areas.rowid = areas_fts.rowid
  where areas_fts match @ftsQuery
    and (@snapshotId is null or areas.snapshot_id = @snapshotId)
    and (@useCurrentSnapshotTable = 0 or exists (
      select 1
      from temp.current_area_snapshots current
      where current.layer_id = areas.layer_id
        and current.snapshot_id = areas.snapshot_id
    ))
    and (@useLatestSnapshotPerLayer = 0 or areas.snapshot_id = (
      select max(latest.snapshot_id)
      from areas latest
      where latest.layer_id = areas.layer_id
    ))
    and (@layerId is null or areas.layer_id = @layerId)
    and (@layerIdsCsv is null or instr(',' || @layerIdsCsv || ',', ',' || areas.layer_id || ',') > 0)
    and (@code is null or lower(coalesce(areas.code, '')) = lower(@code))
    and (@validOn is null or (
      (areas.valid_from is null or areas.valid_from <= @validOn)
      and (areas.valid_to is null or areas.valid_to >= @validOn)
    ))
  order by
    rank_bucket asc,
    bm25_score asc,
    areas.layer_id asc,
    coalesce(areas.name, '') collate nocase asc,
    areas.object_id asc,
    areas.rowid asc
  limit @limit
`;

function installCurrentSnapshotTable(database: Database.Database, currentSnapshots: readonly { readonly layerId: string; readonly snapshotId: number }[]): void {
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

function toAreaSearchResult(row: AreaSearchSqlRow): AreaSearchResult {
  return {
    aliases: row.aliases,
    code: row.code,
    layerId: row.layer_id,
    name: row.name,
    normalizedName: row.normalized_name,
    objectId: row.object_id,
    rank: {
      bm25: row.bm25_score,
      bucket: toAreaSearchRankBucket(row.rank_bucket),
    },
    rowid: row.rowid,
    snapshotId: row.snapshot_id,
  };
}

function escapeLike(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}
