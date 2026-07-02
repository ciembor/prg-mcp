import { stat } from "node:fs/promises";
import { join } from "node:path";

import Database from "better-sqlite3";

import type { PrgConfig } from "../../../runtime/config.js";
import { isMissingSqliteTableError } from "../../../shared/data-result.js";
import { prgVoivodeshipCodes } from "../../persistence/index.js";
import { listPrgLayers, type PrgLayer, type PrgLayerCategory } from "../../source-catalog/index.js";

export type ListedLayer = PrgLayer & {
  readonly available: boolean;
  readonly recordCount: number;
  readonly installedScopes: readonly string[];
  readonly usage: string;
};

const usageByCategory: Readonly<Record<PrgLayerCategory, string>> = {
  address: "Use for address points or street lookup; install an explicit TERYT scope.",
  administrative: "Use for administrative containment, identifiers and official boundaries.",
  court: "Use to determine territorial court jurisdiction.",
  maritime: "Use for Polish maritime boundaries, coastal lines, ports and related spatial relations.",
  office: "Use to determine territorial competence of public offices and authorities.",
  prosecution: "Use to determine territorial prosecution jurisdiction.",
  service: "Use to determine territorial competence of police, fire, border guard or civil defence units.",
  statistical: "Use for statistical regions and census enumeration areas.",
};

export async function listLayers(config: PrgConfig): Promise<readonly ListedLayer[]> {
  const coverage = await readCoverage(config.dataDir);
  const counts = await readCounts(config.dataDir);
  return listPrgLayers().map((layer) => {
    const installedScopes = coverage.scopes.get(layer.layerId) ?? [];
    const recordCount = counts.get(layer.layerId) ?? 0;
    return {
      ...layer,
      available: installedScopes.length > 0 || (!coverage.layerIdsWithCatalogCoverage.has(layer.layerId) && recordCount > 0),
      installedScopes,
      recordCount,
      usage: usageByCategory[layer.category],
    };
  });
}

type LayerCoverageIndex = {
  readonly layerIdsWithCatalogCoverage: ReadonlySet<string>;
  readonly scopes: ReadonlyMap<string, readonly string[]>;
};

async function readCoverage(dataDir: string): Promise<LayerCoverageIndex> {
  const path = join(dataDir, "catalog.sqlite");
  if (!(await exists(path))) return { layerIdsWithCatalogCoverage: new Set(), scopes: new Map() };
  const rows = readSafely(() => withReadonlyDatabase(path, (database) => database.prepare(
    `
      select distinct layer_id as layerId, scope_type as scopeType, scope_code as scopeCode
      from installed_coverage
      where completeness = 'complete'
        and dataset_key = 'current:' || layer_id
        and archive_year = 0
      order by layer_id, scope_type, scope_code
    `,
  ).all() as { layerId: string; scopeType: string; scopeCode: string }[]));
  if (!rows) return { layerIdsWithCatalogCoverage: new Set(), scopes: new Map() };
  const result = new Map<string, string[]>();
  for (const row of rows) result.set(row.layerId, [...(result.get(row.layerId) ?? []), `${row.scopeType}:${row.scopeCode}`]);
  return { layerIdsWithCatalogCoverage: new Set(rows.map((row) => row.layerId)), scopes: result };
}

async function readCounts(dataDir: string): Promise<ReadonlyMap<string, number>> {
  const counts = new Map<string, number>();
  const boundariesPath = join(dataDir, "boundaries.sqlite");
  if (await exists(boundariesPath)) {
    const currentSnapshots = await readCurrentAreaSnapshots(dataDir);
    const rows = readSafely(() => withReadonlyDatabase(boundariesPath, (database) => {
      if (currentSnapshots.length === 0) {
        return database.prepare("select layer_id as layerId, count(*) as recordCount from areas group by layer_id").all() as { layerId: string; recordCount: number }[];
      }

      const snapshotIds = currentSnapshots.map((_, index) => `@snapshotId${index}`).join(", ");
      return database.prepare(`
        select layer_id as layerId, count(*) as recordCount
        from areas
        where snapshot_id in (${snapshotIds})
        group by layer_id
      `).all(Object.fromEntries(currentSnapshots.map((snapshot, index) => [`snapshotId${index}`, snapshot.snapshotId]))) as { layerId: string; recordCount: number }[];
    })) ?? [];
    for (const row of rows) counts.set(row.layerId, row.recordCount);
  }
  for (const code of prgVoivodeshipCodes) await addAddressShardCounts(counts, join(dataDir, `addresses-${code}.sqlite`));
  return counts;
}

async function readCurrentAreaSnapshots(dataDir: string): Promise<readonly { readonly snapshotId: number }[]> {
  const path = join(dataDir, "catalog.sqlite");
  if (!(await exists(path))) return [];

  return readSafely(() => withReadonlyDatabase(path, (database) => database.prepare(`
    select snapshot_id as snapshotId
    from installed_coverage
    where completeness = 'complete'
      and dataset_key = 'current:' || layer_id
      and archive_year = 0
      and scope_type = 'country'
      and scope_code = 'PL'
    order by layer_id
  `).all() as { snapshotId: number }[])) ?? [];
}

async function addAddressShardCounts(counts: Map<string, number>, path: string): Promise<void> {
  if (!(await exists(path))) return;
  withReadonlyDatabase(path, (database) => {
    add(counts, "A07", readCountSafely(database, "addresses") ?? 0);
    add(counts, "A08", readCountSafely(database, "streets") ?? 0);
  });
}

function add(counts: Map<string, number>, layerId: string, value: number): void { counts.set(layerId, (counts.get(layerId) ?? 0) + value); }

function withReadonlyDatabase<T>(path: string, callback: (database: Database.Database) => T): T {
  const database = new Database(path, { fileMustExist: true, readonly: true });
  try { return callback(database); } finally { database.close(); }
}

function readCountSafely(database: Database.Database, table: "addresses" | "streets"): number | undefined {
  return readSafely(() => (database.prepare(`select count(*) as count from ${table}`).get() as { count: number }).count);
}

function readSafely<T>(callback: () => T): T | undefined {
  try {
    return callback();
  } catch (error) {
    if (isMissingSqliteTableError(error)) {
      return undefined;
    }

    throw error;
  }
}

async function exists(path: string): Promise<boolean> {
  try { return (await stat(path)).isFile(); } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}
