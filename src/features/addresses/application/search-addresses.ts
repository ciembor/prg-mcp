import type { PrgConfig } from "../../../runtime/config.js";
import { assertDataInstalled } from "../../../shared/data-result.js";
import type { PrgVoivodeshipCode } from "../../persistence/index.js";
import { compareAddressResults, searchAddresses as searchAddressFts, type AddressSearchResult } from "../../search/index.js";
import { addressRecoveryAction, decodeStreetId, listInstalledAddressShards, openAddressShard, toAddressSummary, type AddressRow, type AddressSummary } from "./address-model.js";

export type AddressStructuredQuery = {
  readonly localityName?: string;
  readonly streetName?: string;
  readonly buildingNumber?: string;
  readonly postalCode?: string;
  readonly municipalityCode?: string;
  readonly localityId?: string;
  readonly streetId?: string;
};

export type SearchAddressesInput = {
  readonly query?: string;
  readonly structured?: AddressStructuredQuery;
  readonly voivodeshipCodes?: readonly PrgVoivodeshipCode[];
  readonly limit?: number;
};

export type SearchAddressesResult = {
  readonly addresses: readonly AddressSummary[];
};

export async function searchAddresses(config: PrgConfig, input: SearchAddressesInput): Promise<SearchAddressesResult> {
  validateSearchInput(input);
  const limit = Math.min(input.limit ?? 20, 100);
  const structuredQuery = input.structured ? normalizeStructuredQuery(input.structured) : undefined;
  const addresses: Array<AddressSummary & { readonly rank?: AddressSearchResult }> = [];
  const installedShards = listInstalledAddressShards(config, input.voivodeshipCodes);

  assertDataInstalled(installedShards.length > 0, "PRG address data is not installed for the requested scope.", addressRecoveryAction(input.voivodeshipCodes));

  for (const voivodeshipCode of installedShards) {
    const database = openAddressShard(config, voivodeshipCode);

    if (!database) {
      continue;
    }

    try {
      const shardResults = input.query
        ? searchAddressFts(database, { limit, query: input.query })
        : searchStructuredObjectIds(database, structuredQuery ?? {}, limit).map((objectId) => ({ objectId }));
      const objectIds = shardResults.map((result) => result.objectId);

      if (objectIds.length === 0) {
        continue;
      }

      const rankByObjectId = new Map(shardResults.filter(isAddressSearchResult).map((result) => [result.objectId, result]));
      const rows = readAddressesByObjectIds(database, objectIds);
      addresses.push(...rows.map((row) => ({ ...toAddressSummary(voivodeshipCode, row), rank: rankByObjectId.get(row.object_id) })));
    } finally {
      database.close();
    }
  }

  return { addresses: sortAddressSummaries(addresses).slice(0, limit).map(toAddressWithoutRank) };
}

function validateSearchInput(input: SearchAddressesInput): void {
  const hasQuery = Boolean(input.query);
  const hasStructured = Boolean(input.structured);

  if (hasQuery === hasStructured) {
    throw new Error("search_addresses requires exactly one of query or structured input.");
  }

  if (input.structured && Object.values(input.structured).every((value) => value === undefined || value === "")) {
    throw new Error("search_addresses structured input requires at least one field.");
  }
}

function normalizeStructuredQuery(query: AddressStructuredQuery): AddressStructuredQuery {
  return {
    ...query,
    streetId: query.streetId ? decodeStructuredStreetId(query.streetId) : undefined,
  };
}

function decodeStructuredStreetId(streetId: string): string {
  try {
    return decodeStreetId(streetId).objectId;
  } catch {
    return streetId;
  }
}

function searchStructuredObjectIds(database: import("better-sqlite3").Database, query: AddressStructuredQuery, limit: number): string[] {
  return (database
    .prepare(`
      select object_id
      from addresses
      where (@municipalityCode is null or municipality_code = @municipalityCode)
        and (@localityId is null or locality_id = @localityId)
        and (@streetId is null or street_id = @streetId)
        and (@localityName is null or lower(locality_name) = lower(@localityName))
        and (@streetName is null or lower(street_name) = lower(@streetName))
        and (@buildingNumber is null or lower(building_number) = lower(@buildingNumber))
        and (@postalCode is null or postal_code = @postalCode)
      order by locality_name collate nocase asc, street_name collate nocase asc, building_number collate nocase asc, object_id asc
      limit @limit
    `)
    .all({
      buildingNumber: query.buildingNumber ?? null,
      limit,
      localityId: query.localityId ?? null,
      localityName: query.localityName ?? null,
      municipalityCode: query.municipalityCode ?? null,
      postalCode: query.postalCode ?? null,
      streetId: query.streetId ?? null,
      streetName: query.streetName ?? null,
    }) as Array<{ object_id: string }>).map((row) => row.object_id);
}

function readAddressesByObjectIds(database: import("better-sqlite3").Database, objectIds: readonly string[]): AddressRow[] {
  if (objectIds.length === 0) {
    return [];
  }

  const placeholders = objectIds.map((_, index) => `@objectId${index}`).join(", ");
  const order = objectIds.map((objectId, index) => `when '${objectId.replaceAll("'", "''")}' then ${index}`).join(" ");
  const parameters = Object.fromEntries(objectIds.map((objectId, index) => [`objectId${index}`, objectId]));

  return database
    .prepare(`
      select *
      from addresses
      where object_id in (${placeholders})
      order by case object_id ${order} end
    `)
    .all(parameters) as AddressRow[];
}

function isAddressSearchResult(result: { readonly objectId: string } | AddressSearchResult): result is AddressSearchResult {
  return "match" in result;
}

function sortAddressSummaries(addresses: Array<AddressSummary & { readonly rank?: AddressSearchResult }>): Array<AddressSummary & { readonly rank?: AddressSearchResult }> {
  return addresses.sort((left, right) => {
    if (left.rank && right.rank) return compareAddressResults(left.rank, right.rank);
    if (left.rank) return -1;
    if (right.rank) return 1;
    return (
      (left.localityName ?? "").localeCompare(right.localityName ?? "", "pl")
      || (left.streetName ?? "").localeCompare(right.streetName ?? "", "pl")
      || left.buildingNumber.localeCompare(right.buildingNumber, "pl")
      || left.objectId.localeCompare(right.objectId, "pl")
    );
  });
}

function toAddressWithoutRank(address: AddressSummary & { readonly rank?: AddressSearchResult }): AddressSummary {
  return {
    addressId: address.addressId,
    buildingNumber: address.buildingNumber,
    iipId: address.iipId,
    localityId: address.localityId,
    localityName: address.localityName,
    municipalityCode: address.municipalityCode,
    objectId: address.objectId,
    point: address.point,
    postalCode: address.postalCode,
    postalCodeNote: address.postalCodeNote,
    sourceProperties: address.sourceProperties,
    sourceScope: address.sourceScope,
    streetId: address.streetId,
    streetName: address.streetName,
    validFrom: address.validFrom,
    versionFrom: address.versionFrom,
    voivodeshipCode: address.voivodeshipCode,
  };
}
