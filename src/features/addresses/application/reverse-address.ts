import type { PrgConfig } from "../../../runtime/config.js";
import { assertDataInstalled, isMissingSqliteTableError } from "../../../shared/data-result.js";
import type { PrgVoivodeshipCode } from "../../persistence/index.js";
import { addressRecoveryAction, listInstalledAddressShards, openAddressShard, toAddressSummary, AddressToolError, type AddressRow, type AddressSummary } from "./address-model.js";

export type ReverseAddressInput = {
  readonly x: number;
  readonly y: number;
  readonly radiusMeters?: number;
  readonly maxCandidates?: number;
  readonly voivodeshipCodes?: readonly PrgVoivodeshipCode[];
  readonly limit?: number;
};

export type ReverseAddressResult = {
  readonly point: readonly [number, number];
  readonly radiusMeters: number;
  readonly addresses: readonly (AddressSummary & { readonly distanceMeters: number })[];
};

const maximumRadiusMeters = 10_000;

export async function reverseAddress(config: PrgConfig, input: ReverseAddressInput): Promise<ReverseAddressResult> {
  const radiusMeters = input.radiusMeters ?? 500;
  const maxCandidates = input.maxCandidates ?? 500;
  const limit = input.limit ?? 10;

  validateReverseAddressInput(input, radiusMeters, limit);

  const results: Array<AddressSummary & { distanceMeters: number }> = [];
  const installedShards = listInstalledAddressShards(config, input.voivodeshipCodes);
  let candidateCount = 0;

  assertDataInstalled(installedShards.length > 0, "PRG address data is not installed for the requested scope.", addressRecoveryAction(input.voivodeshipCodes));

  for (const voivodeshipCode of installedShards) {
    const database = openAddressShard(config, voivodeshipCode);

    if (!database) {
      continue;
    }

    try {
      const queryCandidateLimit = maxCandidates;
      const useRtree = isAddressRtreeComplete(database);
      const tableCandidateCount = countTableCandidates(database, input.x, input.y, radiusMeters);
      const rtreeCandidateCount = useRtree ? countRtreeCandidates(database, input.x, input.y, radiusMeters) : undefined;
      candidateCount += tableCandidateCount;
      if (candidateCount > maxCandidates) {
        throw new AddressToolError("CANDIDATE_LIMIT_EXCEEDED", `reverse_address candidate limit is ${maxCandidates}.`);
      }

      let rows = useRtree && rtreeCandidateCount === tableCandidateCount
        ? readRtreeCandidates(database, input.x, input.y, radiusMeters, queryCandidateLimit)
        : [];

      if (rows.length === 0) {
        rows = readTableCandidates(database, input.x, input.y, radiusMeters, queryCandidateLimit);
      }

      results.push(
        ...rows
          .map((row) => ({ ...toAddressSummary(voivodeshipCode, row), distanceMeters: distance(input.x, input.y, row.x, row.y) }))
          .filter((row) => row.distanceMeters <= radiusMeters),
      );
    } finally {
      database.close();
    }
  }

  return {
    addresses: limitGlobalCandidates(results, limit),
    point: [input.x, input.y],
    radiusMeters,
  };
}

function validateReverseAddressInput(input: ReverseAddressInput, radiusMeters: number, limit: number): void {
  if (!Number.isFinite(input.x) || !Number.isFinite(input.y)) {
    throw new AddressToolError("INVALID_INPUT", "reverse_address coordinates must be finite numbers.");
  }

  if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) {
    throw new AddressToolError("INVALID_INPUT", "reverse_address radiusMeters must be greater than 0.");
  }

  if (!Number.isInteger(input.maxCandidates ?? 500) || (input.maxCandidates ?? 500) < 1 || (input.maxCandidates ?? 500) > 5_000) {
    throw new AddressToolError("INVALID_INPUT", "reverse_address maxCandidates must be an integer between 1 and 5000.");
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new AddressToolError("INVALID_INPUT", "reverse_address limit must be an integer between 1 and 100.");
  }

  if (input.voivodeshipCodes && input.voivodeshipCodes.length === 0) {
    throw new AddressToolError("INVALID_INPUT", "reverse_address voivodeshipCodes must not be empty.");
  }

  if (radiusMeters > maximumRadiusMeters) {
    throw new AddressToolError("RADIUS_LIMIT_EXCEEDED", `reverse_address radius limit is ${maximumRadiusMeters} meters.`);
  }
}

function countRtreeCandidates(database: import("better-sqlite3").Database, x: number, y: number, radiusMeters: number): number {
  try {
    return (database
      .prepare(`
        select count(*) as count
        from addresses_rtree
        join addresses on addresses.rowid = addresses_rtree.rowid
        where addresses_rtree.min_x <= @maxX
          and addresses_rtree.max_x >= @minX
          and addresses_rtree.min_y <= @maxY
          and addresses_rtree.max_y >= @minY
          and ((addresses.x - @x) * (addresses.x - @x) + (addresses.y - @y) * (addresses.y - @y)) <= @radiusSquared
      `)
      .get(candidateParameters(x, y, radiusMeters, 1)) as { count: number }).count;
  } catch (error) {
    if (isMissingSqliteTableError(error)) {
      return countTableCandidates(database, x, y, radiusMeters);
    }

    throw error;
  }
}

function countTableCandidates(database: import("better-sqlite3").Database, x: number, y: number, radiusMeters: number): number {
  return (database
    .prepare(`
      select count(*) as count
      from addresses
      where x between @minX and @maxX
        and y between @minY and @maxY
        and ((x - @x) * (x - @x) + (y - @y) * (y - @y)) <= @radiusSquared
    `)
    .get(candidateParameters(x, y, radiusMeters, 1)) as { count: number }).count;
}

function readRtreeCandidates(database: import("better-sqlite3").Database, x: number, y: number, radiusMeters: number, limit: number): AddressRow[] {
  try {
    return database
      .prepare(`
        select addresses.*
        from addresses_rtree
        join addresses on addresses.rowid = addresses_rtree.rowid
        where addresses_rtree.min_x <= @maxX
          and addresses_rtree.max_x >= @minX
          and addresses_rtree.min_y <= @maxY
          and addresses_rtree.max_y >= @minY
          and ((addresses.x - @x) * (addresses.x - @x) + (addresses.y - @y) * (addresses.y - @y)) <= @radiusSquared
        order by
          ((addresses.x - @x) * (addresses.x - @x) + (addresses.y - @y) * (addresses.y - @y)) asc,
          addresses.object_id asc
        limit @queryCandidateLimit
      `)
      .all(candidateParameters(x, y, radiusMeters, limit)) as AddressRow[];
  } catch (error) {
    if (isMissingSqliteTableError(error)) {
      return [];
    }

    throw error;
  }
}

function readTableCandidates(database: import("better-sqlite3").Database, x: number, y: number, radiusMeters: number, limit: number): AddressRow[] {
  return database
    .prepare(`
      select *
      from addresses
      where x between @minX and @maxX
        and y between @minY and @maxY
        and ((x - @x) * (x - @x) + (y - @y) * (y - @y)) <= @radiusSquared
      order by
        ((x - @x) * (x - @x) + (y - @y) * (y - @y)) asc,
        object_id asc
      limit @queryCandidateLimit
    `)
    .all(candidateParameters(x, y, radiusMeters, limit)) as AddressRow[];
}

function candidateParameters(x: number, y: number, radiusMeters: number, limit: number): Record<string, number> {
  return {
    maxX: x + radiusMeters,
    maxY: y + radiusMeters,
    minX: x - radiusMeters,
    minY: y - radiusMeters,
    queryCandidateLimit: limit,
    radiusSquared: radiusMeters * radiusMeters,
    x,
    y,
  };
}

function isAddressRtreeComplete(database: import("better-sqlite3").Database): boolean {
  try {
    const row = database
      .prepare(`
        select
          (select count(*) from addresses) as addressCount,
          (select count(*) from addresses_rtree) as rtreeCount
      `)
      .get() as { addressCount: number; rtreeCount: number };

    return row.addressCount === row.rtreeCount;
  } catch (error) {
    if (isMissingSqliteTableError(error)) {
      return false;
    }

    throw error;
  }
}

function limitGlobalCandidates(
  results: Array<AddressSummary & { distanceMeters: number }>,
  limit: number,
): readonly (AddressSummary & { readonly distanceMeters: number })[] {
  const sorted = results.sort((left, right) => left.distanceMeters - right.distanceMeters || left.objectId.localeCompare(right.objectId, "pl"));

  return sorted.slice(0, Math.min(limit, 100));
}

function distance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.hypot(x1 - x2, y1 - y2);
}
