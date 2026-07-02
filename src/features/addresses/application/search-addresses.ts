import type { PrgConfig } from "../../../runtime/config.js";
import { assertDataInstalled } from "../../../shared/data-result.js";
import type { PrgVoivodeshipCode } from "../../persistence/index.js";
import {
  compareAddressResults,
  normalizePolishSearchText,
  normalizePostalCodeSearchText,
  searchAddresses as searchAddressFts,
  type AddressSearchResult,
} from "../../search/index.js";
import {
  AddressToolError,
  addressRecoveryAction,
  decodeStreetId,
  listInstalledAddressShards,
  openAddressShard,
  toAddressSummary,
  type AddressRow,
  type AddressSummary,
  type StreetIdentifier,
} from "./address-model.js";

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

type NormalizedStructuredQuery = AddressStructuredQuery & {
  readonly streetIdentifier?: StreetIdentifier;
};

export async function searchAddresses(config: PrgConfig, input: SearchAddressesInput): Promise<SearchAddressesResult> {
  validateSearchInput(input);
  const limit = input.limit ?? 20;
  const query = input.query?.trim();
  const structuredQuery = input.structured ? normalizeStructuredQuery(input.structured) : undefined;
  const addresses: Array<AddressSummary & { readonly rank?: AddressSearchResult }> = [];
  const shardSelection = selectAddressShards(input.voivodeshipCodes, structuredQuery?.streetIdentifier);
  const installedShards = listInstalledAddressShards(config, shardSelection);

  assertDataInstalled(installedShards.length > 0, "PRG address data is not installed for the requested scope.", addressRecoveryAction(input.voivodeshipCodes));

  for (const voivodeshipCode of installedShards) {
    const database = openAddressShard(config, voivodeshipCode);

    if (!database) {
      continue;
    }

    try {
      const shardResults = query
        ? searchAddressFts(database, { limit, query })
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
  const hasQuery = input.query !== undefined && input.query.trim().length > 0;
  const hasStructured = Boolean(input.structured);

  if (hasQuery === hasStructured || (input.query !== undefined && input.query.trim().length === 0)) {
    throw new AddressToolError("INVALID_INPUT", "search_addresses requires exactly one of query or structured input.");
  }

  if (input.structured && Object.values(input.structured).every((value) => value === undefined || value === "")) {
    throw new AddressToolError("INVALID_INPUT", "search_addresses structured input requires at least one field.");
  }

  if (input.structured && Object.values(input.structured).some((value) => value === "")) {
    throw new AddressToolError("INVALID_INPUT", "search_addresses structured fields must not be empty strings.");
  }

  if (input.limit !== undefined && (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100)) {
    throw new AddressToolError("INVALID_INPUT", "search_addresses limit must be an integer between 1 and 100.");
  }

  if (input.voivodeshipCodes && input.voivodeshipCodes.length === 0) {
    throw new AddressToolError("INVALID_INPUT", "search_addresses voivodeshipCodes must not be empty.");
  }
}

function normalizeStructuredQuery(query: AddressStructuredQuery): NormalizedStructuredQuery {
  const streetIdentifier = query.streetId ? decodeStructuredStreetId(query.streetId) : undefined;
  return {
    ...query,
    streetId: streetIdentifier?.objectId ?? query.streetId,
    streetIdentifier,
  };
}

function decodeStructuredStreetId(streetId: string): StreetIdentifier | undefined {
  try {
    return decodeStreetId(streetId);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown parse error";
    throw new AddressToolError("INVALID_INPUT", `Invalid search_addresses structured streetId: ${reason}`);
  }
}

function selectAddressShards(
  requested: readonly PrgVoivodeshipCode[] | undefined,
  identifier: StreetIdentifier | undefined,
): readonly PrgVoivodeshipCode[] | undefined {
  if (!identifier) {
    return requested;
  }

  if (requested && !requested.includes(identifier.voivodeshipCode)) {
    throw new AddressToolError("INVALID_INPUT", "search_addresses streetId voivodeship is outside requested voivodeshipCodes.");
  }

  return [identifier.voivodeshipCode];
}

function searchStructuredObjectIds(database: import("better-sqlite3").Database, query: AddressStructuredQuery, limit: number): string[] {
  database.function("normalizedText", { deterministic: true }, (value: unknown) => (typeof value === "string" ? normalizePolishSearchText(value) : ""));

  return (database
    .prepare(`
      select object_id
      from addresses
      where (@municipalityCode is null or municipality_code = @municipalityCode)
        and (@localityId is null or locality_id = @localityId)
        and (@streetId is null or street_id = @streetId)
        and (@localityName is null or normalizedText(locality_name) = @localityName)
        and (@streetName is null or normalizedText(street_name) = @streetName)
        and (@buildingNumber is null or normalizedText(building_number) = @buildingNumber)
        and (@postalCode is null or normalizedText(postal_code) = @postalCode)
      order by locality_name collate nocase asc, street_name collate nocase asc, building_number collate nocase asc, object_id asc
      limit @limit
    `)
    .all({
      buildingNumber: normalizeStructuredText(query.buildingNumber),
      limit,
      localityId: query.localityId ?? null,
      localityName: normalizeStructuredText(query.localityName),
      municipalityCode: query.municipalityCode ?? null,
      postalCode: normalizeStructuredPostalCode(query.postalCode),
      streetId: query.streetId ?? null,
      streetName: normalizeStructuredText(query.streetName),
    }) as Array<{ object_id: string }>).map((row) => row.object_id);
}

function normalizeStructuredText(value: string | undefined): string | null {
  return value === undefined ? null : normalizePolishSearchText(value);
}

function normalizeStructuredPostalCode(value: string | undefined): string | null {
  return value === undefined ? null : normalizePostalCodeSearchText(value);
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
