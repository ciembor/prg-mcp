import type { PrgConfig } from "../../../runtime/config.js";
import { assertDataInstalled } from "../../../shared/data-result.js";
import type { PrgVoivodeshipCode } from "../../persistence/index.js";
import { searchStreets as searchStreetFts } from "../../search/index.js";
import { listInstalledAddressShards, openAddressShard, readStreetById, toStreetSummary, type StreetRow, type StreetSummary, type StreetWithGeometry } from "./address-model.js";

export type SearchStreetsInput = {
  readonly query: string;
  readonly voivodeshipCodes?: readonly PrgVoivodeshipCode[];
  readonly limit?: number;
};

export type SearchStreetsResult = {
  readonly streets: readonly StreetSummary[];
};

export async function searchStreets(config: PrgConfig, input: SearchStreetsInput): Promise<SearchStreetsResult> {
  const limit = Math.min(input.limit ?? 20, 100);
  const streets: StreetSummary[] = [];
  const installedShards = listInstalledAddressShards(config, input.voivodeshipCodes);

  assertDataInstalled(installedShards.length > 0, "PRG street data is not installed for the requested scope.", addressSyncCommand(input.voivodeshipCodes));

  for (const voivodeshipCode of installedShards) {
    const database = openAddressShard(config, voivodeshipCode);

    if (!database) {
      continue;
    }

    try {
      const objectIds = searchStreetFts(database, { limit, query: input.query }).map((result) => result.objectId);
      const rows = readStreetsByObjectIds(database, objectIds);
      streets.push(...rows.map((row) => toStreetSummary(voivodeshipCode, row)));
    } finally {
      database.close();
    }
  }

  return { streets: streets.slice(0, limit) };
}

function addressSyncCommand(voivodeshipCodes?: readonly PrgVoivodeshipCode[]): string {
  return voivodeshipCodes && voivodeshipCodes.length === 1
    ? `prg-mcp setup --profile addresses --teryt ${voivodeshipCodes[0]}`
    : "prg-mcp setup --profile addresses";
}

export async function getStreet(config: PrgConfig, streetId: string): Promise<StreetWithGeometry> {
  return readStreetById(config, streetId);
}

function readStreetsByObjectIds(database: import("better-sqlite3").Database, objectIds: readonly string[]): StreetRow[] {
  if (objectIds.length === 0) {
    return [];
  }

  const placeholders = objectIds.map((_, index) => `@objectId${index}`).join(", ");
  const order = objectIds.map((objectId, index) => `when '${objectId.replaceAll("'", "''")}' then ${index}`).join(" ");
  const parameters = Object.fromEntries(objectIds.map((objectId, index) => [`objectId${index}`, objectId]));

  return database
    .prepare(`
      select *
      from streets
      where object_id in (${placeholders})
      order by case object_id ${order} end
    `)
    .all(parameters) as StreetRow[];
}
