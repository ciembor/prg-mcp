import Database from "better-sqlite3";

import type { PrgConfig } from "../../../runtime/config.js";
import { assertDataInstalled, databaseFileExists } from "../../../shared/data-result.js";
import { readAreaById, toAreaSummary, toAreaWithGeometry, type AreaSummary, type AreaWithGeometry } from "./area-model.js";

export async function getArea(config: PrgConfig, areaId: string): Promise<AreaSummary> {
  assertDataInstalled(databaseFileExists(config, "boundaries.sqlite"), "PRG boundary data is not installed.", "prg-mcp sync --profile administrative --mode missing");
  const database = new Database(`${config.dataDir}/boundaries.sqlite`, { readonly: true });

  try {
    return toAreaSummary(readAreaById(database, areaId));
  } finally {
    database.close();
  }
}

export async function getAreaWithGeometry(config: PrgConfig, areaId: string): Promise<AreaWithGeometry> {
  assertDataInstalled(databaseFileExists(config, "boundaries.sqlite"), "PRG boundary data is not installed.", "prg-mcp sync --profile administrative --mode missing");
  const database = new Database(`${config.dataDir}/boundaries.sqlite`, { readonly: true });

  try {
    return toAreaWithGeometry(readAreaById(database, areaId));
  } finally {
    database.close();
  }
}
