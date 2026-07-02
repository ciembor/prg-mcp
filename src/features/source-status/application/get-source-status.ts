import { stat } from "node:fs/promises";
import { join } from "node:path";

import Database from "better-sqlite3";

import type { PrgConfig } from "../../../runtime/config.js";
import { isMissingSqliteTableError } from "../../../shared/data-result.js";
import { listPrgLayers } from "../../source-catalog/index.js";

export const operationalSourceStates = ["available", "changed", "unavailable", "schema_changed", "unknown"] as const;
export type OperationalSourceState = (typeof operationalSourceStates)[number];
export type CoverageStatus = {
  readonly datasetKey: string;
  readonly layerId: string;
  readonly scopeType: string;
  readonly scopeCode: string;
  readonly completeness: string;
  readonly stateDate?: string;
  readonly recordCount?: number;
};
export type SourceStatusResult = {
  readonly checkedRemote: boolean;
  readonly remoteStatus: "checked" | "not_requested" | "not_configured";
  readonly remoteReason?: string;
  readonly sources: readonly { readonly datasetKey: string; readonly status: OperationalSourceState }[];
  readonly coverage: readonly CoverageStatus[];
  readonly installedLayerCount: number;
  readonly totalLayerCount: number;
};
export type SourceStatusProbe = () => Promise<readonly { readonly datasetKey: string; readonly status: OperationalSourceState }[]>;

export async function getSourceStatus(config: PrgConfig, checkRemote: boolean, probe?: SourceStatusProbe): Promise<SourceStatusResult> {
  const coverage = await readCoverage(join(config.dataDir, "catalog.sqlite"));
  const sources = checkRemote && probe ? await probe() : localSourceStates(coverage);
  const checkedRemote = checkRemote && probe !== undefined;
  return {
    checkedRemote,
    coverage,
    installedLayerCount: new Set(coverage.filter(isCompleteCurrentCoverage).map((item) => item.layerId)).size,
    remoteReason: checkRemote && !probe ? "Remote source status probe is not configured in this build." : undefined,
    remoteStatus: remoteStatus(checkRemote, checkedRemote),
    sources,
    totalLayerCount: listPrgLayers().length,
  };
}

function remoteStatus(checkRemote: boolean, checkedRemote: boolean): SourceStatusResult["remoteStatus"] {
  if (checkedRemote) return "checked";
  return checkRemote ? "not_configured" : "not_requested";
}

async function readCoverage(catalogPath: string): Promise<readonly CoverageStatus[]> {
  if (!(await exists(catalogPath))) return [];
  const database = new Database(catalogPath, { fileMustExist: true, readonly: true });
  try {
    return (database.prepare(`
      select s.dataset_key as datasetKey, c.layer_id as layerId, c.scope_type as scopeType, c.scope_code as scopeCode,
             c.completeness, s.state_date as stateDate, s.record_count as recordCount
      from installed_coverage c join snapshots s on s.id = c.snapshot_id
      order by c.layer_id, c.scope_type, c.scope_code
    `).all() as Array<CoverageStatus & { stateDate: string | null; recordCount: number | null }>).map((row) => ({
      completeness: row.completeness,
      datasetKey: row.datasetKey,
      layerId: row.layerId,
      recordCount: row.recordCount ?? undefined,
      scopeCode: row.scopeCode,
      scopeType: row.scopeType,
      stateDate: row.stateDate ?? undefined,
    }));
  } catch (error) {
    if (isMissingSqliteTableError(error)) {
      return [];
    }

    throw error;
  } finally {
    database.close();
  }
}

function localSourceStates(coverage: readonly CoverageStatus[]): SourceStatusResult["sources"] {
  const keys = new Set(coverage.filter((item) => item.completeness === "complete").map((item) => item.datasetKey));
  return [...keys].sort().map((datasetKey) => ({ datasetKey, status: "unknown" as const }));
}

function isCompleteCurrentCoverage(item: CoverageStatus): boolean {
  return item.completeness === "complete" && item.datasetKey === `current:${item.layerId}`;
}

async function exists(path: string): Promise<boolean> {
  try { return (await stat(path)).isFile(); } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}
