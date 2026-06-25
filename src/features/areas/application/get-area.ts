import Database from "better-sqlite3";

import type { PrgConfig } from "../../../runtime/config.js";
import { assertDataInstalled, databaseTableHasRows } from "../../../shared/data-result.js";
import { readAreaById, toAreaSummary, toAreaWithGeometry, type AreaSummary, type AreaWithGeometry } from "./area-model.js";

export async function getArea(config: PrgConfig, areaId: string): Promise<AreaSummary> {
  assertDataInstalled(databaseTableHasRows(config, "boundaries.sqlite", "areas"), "PRG boundary data is not installed.", boundaryRecoveryAction);
  const database = new Database(`${config.dataDir}/boundaries.sqlite`, { readonly: true });

  try {
    return toAreaSummary(readAreaById(database, areaId));
  } finally {
    database.close();
  }
}

export async function getAreaWithGeometry(config: PrgConfig, areaId: string): Promise<AreaWithGeometry> {
  assertDataInstalled(databaseTableHasRows(config, "boundaries.sqlite", "areas"), "PRG boundary data is not installed.", boundaryRecoveryAction);
  const database = new Database(`${config.dataDir}/boundaries.sqlite`, { readonly: true });

  try {
    return toAreaWithGeometry(readAreaById(database, areaId));
  } finally {
    database.close();
  }
}

const boundaryRecoveryAction = "Data synchronization is not packaged in this build; prepare PRG boundary data with a configured import pipeline for profile administrative.";
