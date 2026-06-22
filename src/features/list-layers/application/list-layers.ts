import { stat } from "node:fs/promises";
import { join } from "node:path";

import Database from "better-sqlite3";

import type { PrgConfig } from "../../../runtime/config.js";
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
    const installedScopes = coverage.get(layer.layerId) ?? [];
    return {
      ...layer,
      available: installedScopes.length > 0,
      installedScopes,
      recordCount: counts.get(layer.layerId) ?? 0,
      usage: usageByCategory[layer.category],
    };
  });
}

async function readCoverage(dataDir: string): Promise<ReadonlyMap<string, readonly string[]>> {
  const path = join(dataDir, "catalog.sqlite");
  if (!(await exists(path))) return new Map();
  const rows = withReadonlyDatabase(path, (database) => database.prepare(
    "select distinct layer_id as layerId, scope_type as scopeType, scope_code as scopeCode from installed_coverage order by layer_id, scope_type, scope_code",
  ).all() as { layerId: string; scopeType: string; scopeCode: string }[]);
  const result = new Map<string, string[]>();
  for (const row of rows) result.set(row.layerId, [...(result.get(row.layerId) ?? []), `${row.scopeType}:${row.scopeCode}`]);
  return result;
}

async function readCounts(dataDir: string): Promise<ReadonlyMap<string, number>> {
  const counts = new Map<string, number>();
  const boundariesPath = join(dataDir, "boundaries.sqlite");
  if (await exists(boundariesPath)) {
    const rows = withReadonlyDatabase(boundariesPath, (database) => database.prepare(
      "select layer_id as layerId, count(*) as recordCount from areas group by layer_id",
    ).all() as { layerId: string; recordCount: number }[]);
    for (const row of rows) counts.set(row.layerId, row.recordCount);
  }
  for (const code of prgVoivodeshipCodes) await addAddressShardCounts(counts, join(dataDir, `addresses-${code}.sqlite`));
  return counts;
}

async function addAddressShardCounts(counts: Map<string, number>, path: string): Promise<void> {
  if (!(await exists(path))) return;
  withReadonlyDatabase(path, (database) => {
    add(counts, "A07", (database.prepare("select count(*) as count from addresses").get() as { count: number }).count);
    add(counts, "A08", (database.prepare("select count(*) as count from streets").get() as { count: number }).count);
  });
}

function add(counts: Map<string, number>, layerId: string, value: number): void { counts.set(layerId, (counts.get(layerId) ?? 0) + value); }

function withReadonlyDatabase<T>(path: string, callback: (database: Database.Database) => T): T {
  const database = new Database(path, { fileMustExist: true, readonly: true });
  try { return callback(database); } finally { database.close(); }
}

async function exists(path: string): Promise<boolean> {
  try { return (await stat(path)).isFile(); } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}
