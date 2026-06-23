import { Buffer } from "node:buffer";
import { existsSync } from "node:fs";
import { join } from "node:path";

import Database from "better-sqlite3";

import type { PrgConfig } from "../../../runtime/config.js";
import { prgVoivodeshipCodes, type PrgVoivodeshipCode } from "../../persistence/index.js";
import { decodeWkb, type PrgGeometry } from "../../spatial/index.js";

export type AddressIdentifier = {
  readonly voivodeshipCode: PrgVoivodeshipCode;
  readonly objectId: string;
};

export type StreetIdentifier = {
  readonly voivodeshipCode: PrgVoivodeshipCode;
  readonly objectId: string;
};

export type AddressRow = {
  readonly rowid: number;
  readonly batch_id: string | null;
  readonly object_id: string;
  readonly iip_id: string | null;
  readonly municipality_code: string | null;
  readonly locality_id: string | null;
  readonly locality_name: string | null;
  readonly street_id: string | null;
  readonly street_name: string | null;
  readonly building_number: string;
  readonly postal_code: string | null;
  readonly x: number;
  readonly y: number;
  readonly valid_from: string | null;
  readonly version_from: string | null;
  readonly source_scope: string;
  readonly source_properties_json: string;
};

export type StreetRow = {
  readonly rowid: number;
  readonly batch_id: string | null;
  readonly object_id: string;
  readonly iip_id: string | null;
  readonly municipality_code: string | null;
  readonly locality_id: string | null;
  readonly name: string;
  readonly normalized_name: string;
  readonly min_x: number;
  readonly min_y: number;
  readonly max_x: number;
  readonly max_y: number;
  readonly geometry_wkb: Buffer;
  readonly source_properties_json: string;
};

export type AddressSummary = {
  readonly addressId: string;
  readonly voivodeshipCode: PrgVoivodeshipCode;
  readonly objectId: string;
  readonly iipId: string | null;
  readonly municipalityCode: string | null;
  readonly localityId: string | null;
  readonly localityName: string | null;
  readonly streetId: string | null;
  readonly streetName: string | null;
  readonly buildingNumber: string;
  readonly postalCode: string | null;
  readonly point: readonly [number, number];
  readonly validFrom: string | null;
  readonly versionFrom: string | null;
  readonly sourceScope: string;
  readonly sourceProperties: Record<string, unknown>;
  readonly postalCodeNote: "postal_code_is_prg_attribute_not_postal_service_validation";
};

export type StreetSummary = {
  readonly streetId: string;
  readonly voivodeshipCode: PrgVoivodeshipCode;
  readonly objectId: string;
  readonly iipId: string | null;
  readonly municipalityCode: string | null;
  readonly localityId: string | null;
  readonly name: string;
  readonly bbox: readonly [number, number, number, number];
  readonly sourceProperties: Record<string, unknown>;
};

export type StreetWithGeometry = StreetSummary & {
  readonly geometry: PrgGeometry;
};

export class AddressToolError extends Error {
  public constructor(
    public readonly code: "ADDRESS_NOT_FOUND" | "STREET_NOT_FOUND" | "INVALID_ADDRESS_ID" | "INVALID_STREET_ID" | "RADIUS_LIMIT_EXCEEDED" | "CANDIDATE_LIMIT_EXCEEDED",
    message: string,
  ) {
    super(message);
    this.name = "AddressToolError";
  }
}

export function encodeAddressId(identifier: AddressIdentifier): string {
  return Buffer.from(JSON.stringify(identifier), "utf8").toString("base64url");
}

export function encodeStreetId(identifier: StreetIdentifier): string {
  return Buffer.from(JSON.stringify(identifier), "utf8").toString("base64url");
}

export function decodeAddressId(addressId: string): AddressIdentifier {
  return decodeIdentifier(addressId, "INVALID_ADDRESS_ID");
}

export function decodeStreetId(streetId: string): StreetIdentifier {
  return decodeIdentifier(streetId, "INVALID_STREET_ID");
}

export function openAddressShard(config: PrgConfig, voivodeshipCode: PrgVoivodeshipCode): Database.Database | undefined {
  const databasePath = join(config.dataDir, `addresses-${voivodeshipCode}.sqlite`);

  if (!existsSync(databasePath)) {
    return undefined;
  }

  return new Database(databasePath, { readonly: true });
}

export function listInstalledAddressShards(config: PrgConfig, selected?: readonly PrgVoivodeshipCode[]): readonly PrgVoivodeshipCode[] {
  const allowed = selected ?? prgVoivodeshipCodes;

  return allowed.filter((voivodeshipCode) => existsSync(join(config.dataDir, `addresses-${voivodeshipCode}.sqlite`)));
}

export function readAddressById(config: PrgConfig, addressId: string): AddressSummary {
  const identifier = decodeAddressId(addressId);
  const database = openAddressShard(config, identifier.voivodeshipCode);

  if (!database) {
    throw new AddressToolError("ADDRESS_NOT_FOUND", "Address shard is not installed.");
  }

  try {
    const row = database.prepare("select * from addresses where object_id = @objectId limit 1").get({ objectId: identifier.objectId }) as AddressRow | undefined;

    if (!row) {
      throw new AddressToolError("ADDRESS_NOT_FOUND", "Address was not found.");
    }

    return toAddressSummary(identifier.voivodeshipCode, row);
  } finally {
    database.close();
  }
}

export function readStreetById(config: PrgConfig, streetId: string): StreetWithGeometry {
  const identifier = decodeStreetId(streetId);
  const database = openAddressShard(config, identifier.voivodeshipCode);

  if (!database) {
    throw new AddressToolError("STREET_NOT_FOUND", "Street shard is not installed.");
  }

  try {
    const row = database.prepare("select * from streets where object_id = @objectId limit 1").get({ objectId: identifier.objectId }) as StreetRow | undefined;

    if (!row) {
      throw new AddressToolError("STREET_NOT_FOUND", "Street was not found.");
    }

    return toStreetWithGeometry(identifier.voivodeshipCode, row);
  } finally {
    database.close();
  }
}

export function toAddressSummary(voivodeshipCode: PrgVoivodeshipCode, row: AddressRow): AddressSummary {
  return {
    addressId: encodeAddressId({ objectId: row.object_id, voivodeshipCode }),
    buildingNumber: row.building_number,
    iipId: row.iip_id,
    localityId: row.locality_id,
    localityName: row.locality_name,
    municipalityCode: row.municipality_code,
    objectId: row.object_id,
    point: [row.x, row.y],
    postalCode: row.postal_code,
    postalCodeNote: "postal_code_is_prg_attribute_not_postal_service_validation",
    sourceProperties: parseSourceProperties(row.source_properties_json),
    sourceScope: row.source_scope,
    streetId: row.street_id,
    streetName: row.street_name,
    validFrom: row.valid_from,
    versionFrom: row.version_from,
    voivodeshipCode,
  };
}

export function toStreetSummary(voivodeshipCode: PrgVoivodeshipCode, row: StreetRow): StreetSummary {
  return {
    bbox: [row.min_x, row.min_y, row.max_x, row.max_y],
    iipId: row.iip_id,
    localityId: row.locality_id,
    municipalityCode: row.municipality_code,
    name: row.name,
    objectId: row.object_id,
    sourceProperties: parseSourceProperties(row.source_properties_json),
    streetId: encodeStreetId({ objectId: row.object_id, voivodeshipCode }),
    voivodeshipCode,
  };
}

function toStreetWithGeometry(voivodeshipCode: PrgVoivodeshipCode, row: StreetRow): StreetWithGeometry {
  return {
    ...toStreetSummary(voivodeshipCode, row),
    geometry: decodeWkb(row.geometry_wkb),
  };
}

function decodeIdentifier(
  value: string,
  errorCode: "INVALID_ADDRESS_ID" | "INVALID_STREET_ID",
): AddressIdentifier {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<AddressIdentifier>;

    if (!parsed.objectId || !parsed.voivodeshipCode || !prgVoivodeshipCodes.includes(parsed.voivodeshipCode)) {
      throw new Error("Invalid identifier payload.");
    }

    return {
      objectId: parsed.objectId,
      voivodeshipCode: parsed.voivodeshipCode,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown parse error";

    throw new AddressToolError(errorCode, `Invalid identifier: ${reason}`);
  }
}

function parseSourceProperties(json: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(json) as unknown;

    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
