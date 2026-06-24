import { stat } from "node:fs/promises";
import { join } from "node:path";

import Database from "better-sqlite3";

import { prgDatabaseSchemaVersion, prgVoivodeshipCodes } from "../../persistence/index.js";
import type { PrgConfig } from "../../../runtime/config.js";

export type DatabaseFileStatus = { readonly name: string; readonly exists: boolean; readonly sizeBytes: number };
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
    const details = await stat(join(dataDir, name));
    return { exists: details.isFile(), name, sizeBytes: details.isFile() ? details.size : 0 };
  } catch (error) {
    if (isNodeError(error, "ENOENT")) return { exists: false, name, sizeBytes: 0 };
    throw error;
  }
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
