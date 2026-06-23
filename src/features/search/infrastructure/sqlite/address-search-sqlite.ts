import type Database from "better-sqlite3";

import {
  classifyTextMatch,
  compareTextMatches,
  normalizePolishSearchText,
  toPolishFtsQuery,
  type AddressSearchDocument,
  type AddressSearchOptions,
  type AddressSearchResult,
  type StreetSearchResult,
} from "../../domain/address-search.js";

type AddressSqlRow = {
  rowid: number;
  object_id: string;
  locality_name: string | null;
  street_name: string | null;
  building_number: string;
  postal_code: string | null;
  bm25_score: number;
};

type StreetSqlRow = {
  rowid: number;
  object_id: string;
  name: string;
  normalized_name: string;
  bm25_score: number;
};

export function insertAddressSearchDocument(database: Database.Database, document: AddressSearchDocument): void {
  database
    .prepare(`
      insert into addresses_fts (
        rowid,
        full_address,
        locality_name,
        street_name,
        building_number,
        postal_code
      ) values (
        @rowid,
        @fullAddress,
        @localityName,
        @streetName,
        @buildingNumber,
        @postalCode
      )
    `)
    .run({
      buildingNumber: normalizePolishSearchText(document.buildingNumber),
      fullAddress: normalizePolishSearchText(document.fullAddress),
      localityName: normalizePolishSearchText(document.localityName),
      postalCode: document.postalCode ? normalizePolishSearchText(document.postalCode) : null,
      rowid: document.rowid,
      streetName: document.streetName ? normalizePolishSearchText(document.streetName) : null,
    });
}

export function rebuildStreetSearchIndex(database: Database.Database): void {
  database.prepare("insert into streets_fts(streets_fts) values ('rebuild')").run();
}

export function searchAddresses(database: Database.Database, options: AddressSearchOptions): AddressSearchResult[] {
  const ftsQuery = toPolishFtsQuery(options.query);

  if (!ftsQuery) {
    return [];
  }

  const rows = database
    .prepare(addressSearchSql)
    .all({
      ftsQuery,
      limit: (options.limit ?? 20) * 5,
    }) as AddressSqlRow[];

  return rows
    .map((row) => toAddressSearchResult(row, options.query))
    .filter((result) => result.match.mode !== "none")
    .sort(compareAddressResults)
    .slice(0, options.limit ?? 20);
}

export function searchStreets(database: Database.Database, options: AddressSearchOptions): StreetSearchResult[] {
  const ftsQuery = toPolishFtsQuery(options.query);

  if (!ftsQuery) {
    return [];
  }

  const rows = database
    .prepare(streetSearchSql)
    .all({
      ftsQuery,
      limit: (options.limit ?? 20) * 5,
    }) as StreetSqlRow[];

  return rows
    .map((row) => toStreetSearchResult(row, options.query))
    .filter((result) => result.match.mode !== "none")
    .sort(compareStreetResults)
    .slice(0, options.limit ?? 20);
}

const addressSearchSql = `
  select
    addresses.rowid,
    addresses.object_id,
    addresses.locality_name,
    addresses.street_name,
    addresses.building_number,
    addresses.postal_code,
    bm25(addresses_fts, 6.0, 4.0, 4.0, 3.0, 1.0) as bm25_score
  from addresses_fts
  join addresses on addresses.rowid = addresses_fts.rowid
  where addresses_fts match @ftsQuery
  order by
    bm25_score asc,
    addresses.object_id asc,
    addresses.rowid asc
  limit @limit
`;

const streetSearchSql = `
  select
    streets.rowid,
    streets.object_id,
    streets.name,
    streets.normalized_name,
    bm25(streets_fts, 4.0, 6.0) as bm25_score
  from streets_fts
  join streets on streets.rowid = streets_fts.rowid
  where streets_fts match @ftsQuery
  order by
    bm25_score asc,
    streets.object_id asc,
    streets.rowid asc
  limit @limit
`;

function toAddressSearchResult(row: AddressSqlRow, query: string): AddressSearchResult & { bm25: number } {
  return {
    bm25: row.bm25_score,
    buildingNumber: row.building_number,
    localityName: row.locality_name,
    match: classifyTextMatch(query, formatAddressCandidate(row)),
    objectId: row.object_id,
    postalCode: row.postal_code,
    rowid: row.rowid,
    streetName: row.street_name,
  };
}

function toStreetSearchResult(row: StreetSqlRow, query: string): StreetSearchResult & { bm25: number } {
  return {
    bm25: row.bm25_score,
    match: classifyTextMatch(query, row.normalized_name),
    name: row.name,
    normalizedName: row.normalized_name,
    objectId: row.object_id,
    rowid: row.rowid,
  };
}

function formatAddressCandidate(row: AddressSqlRow): string {
  return [
    row.locality_name,
    formatStreetName(row.street_name),
    row.building_number,
    row.postal_code,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

function formatStreetName(streetName: string | null): string | undefined {
  if (!streetName) {
    return undefined;
  }

  const normalizedStreetName = normalizePolishSearchText(streetName);

  if (
    normalizedStreetName.startsWith("aleja ")
    || normalizedStreetName.startsWith("plac ")
    || normalizedStreetName.startsWith("rondo ")
    || normalizedStreetName.startsWith("osiedle ")
    || normalizedStreetName.startsWith("ulica ")
  ) {
    return streetName;
  }

  return `ulica ${streetName}`;
}

function compareAddressResults(left: AddressSearchResult & { bm25: number }, right: AddressSearchResult & { bm25: number }): number {
  return compareTextMatches(left.match, right.match) || left.bm25 - right.bm25 || left.objectId.localeCompare(right.objectId, "pl") || left.rowid - right.rowid;
}

function compareStreetResults(left: StreetSearchResult & { bm25: number }, right: StreetSearchResult & { bm25: number }): number {
  return compareTextMatches(left.match, right.match) || left.bm25 - right.bm25 || left.objectId.localeCompare(right.objectId, "pl") || left.rowid - right.rowid;
}
