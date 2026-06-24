import { stat } from "node:fs/promises";
import { join } from "node:path";

import Database from "better-sqlite3";

import type { PrgConfig } from "../../../runtime/config.js";
import { listPrgLayers } from "../../source-catalog/index.js";

export const operationalSourceStates = ["available", "changed", "unavailable", "schema_changed", "unknown"] as const;
export type OperationalSourceState = (typeof operationalSourceStates)[number];
export type CoverageStatus = {
  readonly layerId: string;
  readonly scopeType: string;
  readonly scopeCode: string;
  readonly completeness: string;
  readonly stateDate?: string;
  readonly recordCount?: number;
};
export type SourceStatusResult = {
  readonly checkedRemote: boolean;
  readonly sources: readonly { readonly datasetKey: string; readonly status: OperationalSourceState }[];
  readonly coverage: readonly CoverageStatus[];
  readonly installedLayerCount: number;
  readonly totalLayerCount: number;
};
export type SourceStatusProbe = () => Promise<readonly { readonly datasetKey: string; readonly status: OperationalSourceState }[]>;

export async function getSourceStatus(config: PrgConfig, checkRemote: boolean, probe?: SourceStatusProbe): Promise<SourceStatusResult> {
  const coverage = await readCoverage(join(config.dataDir, "catalog.sqlite"));
  if (checkRemote && !probe) {
    throw new Error("Remote source status probe is not configured.");
  }
  const sources = checkRemote && probe ? await probe() : localSourceStates(coverage);
  return {
    checkedRemote: checkRemote && probe !== undefined,
    coverage,
    installedLayerCount: new Set(coverage.map((item) => item.layerId)).size,
    sources,
    totalLayerCount: listPrgLayers().length,
  };
}

async function readCoverage(catalogPath: string): Promise<readonly CoverageStatus[]> {
  if (!(await exists(catalogPath))) return [];
  const database = new Database(catalogPath, { fileMustExist: true, readonly: true });
  try {
    return (database.prepare(`
      select c.layer_id as layerId, c.scope_type as scopeType, c.scope_code as scopeCode,
             c.completeness, s.state_date as stateDate, s.record_count as recordCount
      from installed_coverage c join snapshots s on s.id = c.snapshot_id
      order by c.layer_id, c.scope_type, c.scope_code
    `).all() as Array<CoverageStatus & { stateDate: string | null; recordCount: number | null }>).map((row) => ({
      completeness: row.completeness,
      layerId: row.layerId,
      recordCount: row.recordCount ?? undefined,
      scopeCode: row.scopeCode,
      scopeType: row.scopeType,
      stateDate: row.stateDate ?? undefined,
    }));
  } finally {
    database.close();
  }
}

function localSourceStates(coverage: readonly CoverageStatus[]): SourceStatusResult["sources"] {
  const keys = new Set(coverage.map((item) => item.layerId));
  return [...keys].sort().map((datasetKey) => ({ datasetKey, status: "unknown" as const }));
}

async function exists(path: string): Promise<boolean> {
  try { return (await stat(path)).isFile(); } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}
