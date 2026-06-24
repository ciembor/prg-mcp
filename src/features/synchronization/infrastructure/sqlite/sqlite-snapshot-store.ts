import Database from "better-sqlite3";

import type { SnapshotStore } from "../../application/run-sync.js";
import type { SnapshotMetadata } from "../../domain/sync-model.js";

type SnapshotRow = {
  dataset_key: string;
  scope: string;
  state_date: string | null;
  downloaded_at: string;
  checked_at: string;
  etag: string | null;
  last_modified: string | null;
  sha256: string;
  record_count: number;
  schema_fingerprint: string;
  adapter_version: string;
  source_url: string;
  archive_year: number | null;
};

export function createSqliteSnapshotStore(catalogPath: string): SnapshotStore {
  return {
    find: async (datasetKey, scope) => withDatabase(catalogPath, (database) => {
      const row = database.prepare(
        "select dataset_key, scope, state_date, downloaded_at, checked_at, etag, last_modified, sha256, record_count, schema_fingerprint, adapter_version, source_url, archive_year from snapshots where dataset_key = ? and scope = ? order by downloaded_at desc limit 1",
      ).get(datasetKey, scope) as SnapshotRow | undefined;
      return row && toMetadata(row);
    }),
    save: async (metadata, target) => withDatabase(catalogPath, (database) => {
      database.transaction(() => {
        database.prepare(`
          insert into snapshots(dataset_key, scope, state_date, state_date_key, downloaded_at, checked_at, etag, last_modified, sha256, record_count, schema_fingerprint, adapter_version, source_url, archive_year)
          values (@datasetKey, @scope, @stateDate, @stateDateKey, @downloadedAt, @checkedAt, @etag, @lastModified, @sha256, @recordCount, @schemaFingerprint, @adapterVersion, @sourceUrl, @archiveYear)
          on conflict(dataset_key, scope, state_date_key) do update set
            state_date=excluded.state_date,
            downloaded_at=excluded.downloaded_at, checked_at=excluded.checked_at, etag=excluded.etag,
            last_modified=excluded.last_modified, sha256=excluded.sha256, record_count=excluded.record_count,
            schema_fingerprint=excluded.schema_fingerprint, adapter_version=excluded.adapter_version, source_url=excluded.source_url
        `).run({
          adapterVersion: metadata.adapterVersion,
          archiveYear: metadata.archiveYear ?? null,
          checkedAt: metadata.checkedAt,
          datasetKey: metadata.datasetKey,
          downloadedAt: metadata.downloadedAt,
          etag: metadata.etag ?? null,
          lastModified: metadata.lastModified ?? null,
          recordCount: metadata.recordCount,
          schemaFingerprint: metadata.schemaFingerprint,
          scope: metadata.scope,
          sha256: metadata.sha256,
          sourceUrl: metadata.sourceUrl,
          stateDate: metadata.stateDate ?? null,
          stateDateKey: metadata.stateDate ?? "",
        });

        const snapshot = database.prepare(`
          select id
          from snapshots
          where dataset_key = @datasetKey
            and scope = @scope
            and state_date_key = @stateDateKey
          order by downloaded_at desc, id desc
          limit 1
        `).get({ datasetKey: metadata.datasetKey, scope: metadata.scope, stateDateKey: metadata.stateDate ?? "" }) as { id: number };
        const [scopeType, ...scopeCodeParts] = metadata.scope.split(":");

        database.prepare(`
          insert into installed_coverage(layer_id, scope_type, scope_code, snapshot_id, completeness)
          values (@layerId, @scopeType, @scopeCode, @snapshotId, 'complete')
          on conflict(layer_id, scope_type, scope_code) do update set
            snapshot_id=excluded.snapshot_id,
            completeness=excluded.completeness
        `).run({
          layerId: target.layer.layerId,
          scopeCode: scopeCodeParts.join(":"),
          scopeType,
          snapshotId: snapshot.id,
        });
      })();
    }),
  };
}

function toMetadata(row: SnapshotRow): SnapshotMetadata {
  return {
    adapterVersion: row.adapter_version,
    archiveYear: row.archive_year ?? undefined,
    checkedAt: row.checked_at,
    datasetKey: row.dataset_key,
    downloadedAt: row.downloaded_at,
    etag: row.etag ?? undefined,
    lastModified: row.last_modified ?? undefined,
    recordCount: row.record_count,
    schemaFingerprint: row.schema_fingerprint,
    scope: row.scope,
    sha256: row.sha256,
    sourceUrl: row.source_url,
    stateDate: row.state_date ?? undefined,
  };
}

function withDatabase<T>(path: string, callback: (database: Database.Database) => T): T {
  const database = new Database(path);
  try { return callback(database); } finally { database.close(); }
}
