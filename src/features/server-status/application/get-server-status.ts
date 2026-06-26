import { stat } from "node:fs/promises";
import { join } from "node:path";

import Database from "better-sqlite3";

import { prgCanonicalMappingVersion, prgDatabaseSchemaVersion, prgVoivodeshipCodes, readPrgDatabaseSchemaState } from "../../persistence/index.js";
import type { PrgConfig } from "../../../runtime/config.js";

export type DatabaseFileStatus = {
  readonly name: string;
  readonly exists: boolean;
  readonly sizeBytes: number;
  readonly schemaVersion?: number;
  readonly canonicalMappingVersion?: string;
  readonly schemaStatus?: "current" | "outdated" | "newer" | "unreadable";
};
export type ServerStatus = {
  readonly transport: "stdio" | "http";
  readonly dataDir: string;
  readonly databaseSchemaVersion: number;
  readonly sqlite: { readonly fts5: boolean; readonly rtree: boolean };
  readonly databases: readonly DatabaseFileStatus[];
  readonly totalSizeBytes: number;
};

export async function getServerStatus(config: PrgConfig): Promise<ServerStatus> {
  const names = ["catalog.sqlite", "boundaries.sqlite", ...prgVoivodeshipCodes.map((code) => `addresses-${code}.sqlite`)];
  const databases = await Promise.all(names.map((name) => fileStatus(config.dataDir, name)));
  const sqlite = detectSqliteExtensions();
  return {
    dataDir: config.dataDir,
    databases,
    databaseSchemaVersion: prgDatabaseSchemaVersion,
    sqlite,
    totalSizeBytes: databases.reduce((sum, file) => sum + file.sizeBytes, 0),
    transport: config.transport,
  };
}

async function fileStatus(dataDir: string, name: string): Promise<DatabaseFileStatus> {
  try {
    const path = join(dataDir, name);
    const details = await stat(path);
    const exists = details.isFile();
    return {
      exists,
      name,
      sizeBytes: exists ? details.size : 0,
      ...(exists ? readSchemaStatus(path) : {}),
    };
  } catch (error) {
    if (isNodeError(error, "ENOENT")) return { exists: false, name, sizeBytes: 0 };
    throw error;
  }
}

function readSchemaStatus(path: string): Pick<DatabaseFileStatus, "schemaVersion" | "canonicalMappingVersion" | "schemaStatus"> {
  try {
    const state = readPrgDatabaseSchemaState(path);
    return {
      canonicalMappingVersion: state.canonicalMappingVersion,
      schemaStatus: schemaStatus(state.version, state.canonicalMappingVersion),
      schemaVersion: state.version,
    };
  } catch {
    return { schemaStatus: "unreadable" };
  }
}

function schemaStatus(version: number, canonicalMappingVersion: string): NonNullable<DatabaseFileStatus["schemaStatus"]> {
  if (version > prgDatabaseSchemaVersion) return "newer";
  if (version < prgDatabaseSchemaVersion || canonicalMappingVersion !== prgCanonicalMappingVersion) return "outdated";
  return "current";
}

function detectSqliteExtensions(): ServerStatus["sqlite"] {
  const database = new Database(":memory:");
  try {
    return {
      fts5: probeSqliteExtension(database, "create virtual table fts_probe using fts5(value)"),
      rtree: probeSqliteExtension(database, "create virtual table rtree_probe using rtree(id,min_x,max_x,min_y,max_y)"),
    };
  } finally {
    database.close();
  }
}

function probeSqliteExtension(database: Database.Database, sql: string): boolean {
  try {
    database.exec(sql);
    return true;
  } catch {
    return false;
  }
}

function isNodeError(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
