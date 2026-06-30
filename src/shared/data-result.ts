import { existsSync } from "node:fs";
import { join } from "node:path";

import Database from "better-sqlite3";

import type { PrgConfig } from "../runtime/config.js";

type DataResultMetadata = {
  readonly source: {
    readonly system: "PRG";
    readonly layerIds: string[];
    readonly channels: string[];
  };
  readonly datasetState: "installed" | "not_installed" | "unknown";
  readonly syncedAt: string | null;
  readonly coverage: {
    readonly complete: boolean;
    readonly installedScopes: string[];
    readonly missingScopes: string[];
  };
};

export class DataNotInstalledError extends Error {
  readonly code = "DATA_NOT_INSTALLED";

  constructor(message: string, readonly recoveryAction: string) {
    super(`${message} ${recoveryAction}`);
    this.name = "DataNotInstalledError";
  }
}

export function createDataResultMetadata(
  config: PrgConfig,
  input: {
    readonly layerIds: readonly string[];
    readonly channels: readonly string[];
    readonly fallbackCoverage?: readonly CoveragePair[];
    readonly fallbackScopes?: readonly string[];
    readonly requestedScopes?: readonly string[];
  },
): DataResultMetadata {
  const coverage = readInstalledCoverage(config, input.layerIds);
  const requestedScopes = input.requestedScopes && input.requestedScopes.length > 0 ? input.requestedScopes : undefined;
  const coveragePairs = coverage.pairs.length > 0 ? coverage.pairs : (input.fallbackCoverage ?? fallbackCoveragePairs(input.layerIds, input.fallbackScopes ?? []));
  const installedScopes = [...new Set(coveragePairs.map((pair) => pair.scope))].sort();
  const missingScopes = requestedScopes ? missingCoverageScopes(input.layerIds, requestedScopes, coveragePairs) : [];

  return {
    coverage: {
      complete: missingScopes.length === 0 && installedScopes.length > 0,
      installedScopes,
      missingScopes,
    },
    datasetState: installedScopes.length > 0 ? "installed" : "not_installed",
    source: {
      channels: [...new Set(input.channels)].sort(),
      layerIds: [...new Set(input.layerIds)].sort(),
      system: "PRG",
    },
    syncedAt: coverage.syncedAt,
  };
}

export function assertDataInstalled(installed: boolean, message: string, recoveryAction: string): void {
  if (!installed) throw new DataNotInstalledError(message, recoveryAction);
}

export function databaseTableHasRows(config: PrgConfig, name: string, table: "addresses" | "areas" | "areas_rtree" | "streets"): boolean {
  const path = join(config.dataDir, name);
  if (!existsSync(path)) return false;

  try {
    const database = new Database(path, { fileMustExist: true, readonly: true });
    try {
      const row = database.prepare(tableHasRowsSql(table)).get() as { present: number } | undefined;
      return row !== undefined;
    } finally {
      database.close();
    }
  } catch (error) {
    if (isMissingSqliteTableError(error)) {
      return false;
    }

    throw error;
  }
}

function tableHasRowsSql(table: "addresses" | "areas" | "areas_rtree" | "streets"): string {
  if (table === "addresses") return "select 1 as present from addresses limit 1";
  if (table === "areas") return "select 1 as present from areas limit 1";
  if (table === "areas_rtree") return "select 1 as present from areas_rtree limit 1";
  return "select 1 as present from streets limit 1";
}

export function isMissingSqliteTableError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "SQLITE_ERROR" && /no such table:/iu.test(error.message);
}

function readInstalledCoverage(config: PrgConfig, layerIds: readonly string[]): { readonly pairs: readonly CoveragePair[]; readonly syncedAt: string | null } {
  if (layerIds.length === 0) return { pairs: [], syncedAt: null };

  const path = join(config.dataDir, "catalog.sqlite");
  if (!existsSync(path)) return { pairs: [], syncedAt: null };

  const database = new Database(path, { fileMustExist: true, readonly: true });
  try {
    const layerIdSet = new Set(layerIds);
    const rows = (database.prepare(`
      select c.layer_id as layerId, c.scope_type as scopeType, c.scope_code as scopeCode, c.completeness as completeness, s.downloaded_at as downloadedAt
      from installed_coverage c join snapshots s on s.id = c.snapshot_id
      order by c.scope_type, c.scope_code, s.downloaded_at desc
    `).all() as Array<{
      layerId: string;
      scopeType: string;
      scopeCode: string;
      completeness: string;
      downloadedAt: string;
    }>).filter((row) => layerIdSet.has(row.layerId) && row.completeness === "complete");

    return {
      pairs: rows.map((row) => ({ layerId: row.layerId, scope: `${row.scopeType}:${row.scopeCode}` })),
      syncedAt: rows.map((row) => row.downloadedAt).sort().at(-1) ?? null,
    };
  } finally {
    database.close();
  }
}

type CoveragePair = {
  readonly layerId: string;
  readonly scope: string;
};

function fallbackCoveragePairs(layerIds: readonly string[], scopes: readonly string[]): readonly CoveragePair[] {
  return layerIds.flatMap((layerId) => scopes.map((scope) => ({ layerId, scope })));
}

function missingCoverageScopes(layerIds: readonly string[], requestedScopes: readonly string[], installedPairs: readonly CoveragePair[]): string[] {
  const installed = new Set(installedPairs.map((pair) => coveragePairKey(pair.layerId, pair.scope)));
  return layerIds.flatMap((layerId) =>
    requestedScopes
      .filter((scope) => !installed.has(coveragePairKey(layerId, scope)))
      .map((scope) => (layerIds.length === 1 ? scope : coveragePairKey(layerId, scope))),
  );
}

function coveragePairKey(layerId: string, scope: string): string {
  return `${layerId}:${scope}`;
}
