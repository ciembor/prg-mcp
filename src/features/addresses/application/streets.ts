import type { PrgConfig } from "../../../runtime/config.js";
import { assertDataInstalled } from "../../../shared/data-result.js";
import type { PrgVoivodeshipCode } from "../../persistence/index.js";
import { compareStreetResults, searchStreets as searchStreetFts, type StreetSearchResult } from "../../search/index.js";
import {
  AddressToolError,
  addressRecoveryAction,
  listInstalledAddressShards,
  openAddressShard,
  readStreetById,
  toStreetSummary,
  type StreetRow,
  type StreetSummary,
  type StreetWithGeometry,
} from "./address-model.js";

export type SearchStreetsInput = {
  readonly query: string;
  readonly voivodeshipCodes?: readonly PrgVoivodeshipCode[];
  readonly limit?: number;
};

export type SearchStreetsResult = {
  readonly streets: readonly StreetSummary[];
};

export async function searchStreets(config: PrgConfig, input: SearchStreetsInput): Promise<SearchStreetsResult> {
  validateSearchStreetsInput(input);
  const limit = Math.min(input.limit ?? 20, 100);
  const streets: Array<StreetSummary & { readonly rank: StreetSearchResult }> = [];
  const installedShards = listInstalledAddressShards(config, input.voivodeshipCodes, "streets");

  assertDataInstalled(installedShards.length > 0, "PRG street data is not installed for the requested scope.", addressRecoveryAction(input.voivodeshipCodes));

  for (const voivodeshipCode of installedShards) {
    const database = openAddressShard(config, voivodeshipCode);

    if (!database) {
      continue;
    }

    try {
      const shardResults = searchStreetFts(database, { limit, query: input.query });
      const objectIds = shardResults.map((result) => result.objectId);
      const rankByObjectId = new Map(shardResults.map((result) => [result.objectId, result]));
      const rows = readStreetsByObjectIds(database, objectIds);
      streets.push(...rows.map((row) => ({ ...toStreetSummary(voivodeshipCode, row), rank: rankByObjectId.get(row.object_id) as StreetSearchResult })));
    } finally {
      database.close();
    }
  }

  return {
    streets: streets
      .sort((left, right) => compareStreetResults(left.rank, right.rank))
      .slice(0, limit)
      .map(toStreetWithoutRank),
  };
}

function validateSearchStreetsInput(input: SearchStreetsInput): void {
  if (!input.query) {
    throw new AddressToolError("INVALID_INPUT", "search_streets query is required.");
  }

  if (input.limit !== undefined && (!Number.isInteger(input.limit) || input.limit < 1)) {
    throw new AddressToolError("INVALID_INPUT", "search_streets limit must be a positive integer.");
  }

  if (input.voivodeshipCodes && input.voivodeshipCodes.length === 0) {
    throw new AddressToolError("INVALID_INPUT", "search_streets voivodeshipCodes must not be empty.");
  }
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

function toStreetWithoutRank(street: StreetSummary & { readonly rank: StreetSearchResult }): StreetSummary {
  return {
    bbox: street.bbox,
    iipId: street.iipId,
    localityId: street.localityId,
    municipalityCode: street.municipalityCode,
    name: street.name,
    objectId: street.objectId,
    sourceProperties: street.sourceProperties,
    streetId: street.streetId,
    voivodeshipCode: street.voivodeshipCode,
  };
}
