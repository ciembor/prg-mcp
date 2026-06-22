import type { SnapshotMetadata, SyncTarget } from "./sync-model.js";

export type SyncRecord = {
  readonly objectId: string;
  readonly crs: "EPSG:2180";
  readonly bbox: readonly [number, number, number, number];
  readonly municipalityCode?: string;
  readonly localityId?: string;
  readonly streetId?: string;
  readonly recordType: "area" | "address" | "street";
};

export type SyncValidationContext = {
  readonly target: SyncTarget;
  readonly metadata: SnapshotMetadata;
  readonly records: readonly SyncRecord[];
};

export class SyncValidationError extends Error {
  constructor(
    message: string,
    readonly code: "DUPLICATE_ID" | "INVALID_CRS" | "INVALID_BBOX" | "OUTSIDE_POLAND" | "BROKEN_REFERENCE" | "MANIFEST_MISMATCH",
    readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = "SyncValidationError";
  }
}

const poland2180Envelope = [-50_000, -100_000, 1_100_000, 1_100_000] as const;

export function validateSyncDataset(context: SyncValidationContext): void {
  const ids = new Set<string>();
  const localityIds = new Set(context.records.flatMap((record) => record.localityId ? [record.localityId] : []));
  const streetIds = new Set(context.records.filter((record) => record.recordType === "street").map((record) => record.objectId));

  for (const record of context.records) {
    if (ids.has(record.objectId)) throw validationError("Duplicate object identifier.", "DUPLICATE_ID", record);
    ids.add(record.objectId);
    if (record.crs !== "EPSG:2180") throw validationError("Canonical record CRS must be EPSG:2180.", "INVALID_CRS", record);
    validateBbox(record);
    if (record.recordType === "address" && record.streetId && streetIds.size > 0 && !streetIds.has(record.streetId)) {
      throw validationError("Address refers to a street absent from the imported scope.", "BROKEN_REFERENCE", record);
    }
    if (record.recordType === "address" && record.localityId && localityIds.size > 0 && !localityIds.has(record.localityId)) {
      throw validationError("Address refers to a locality absent from the imported scope.", "BROKEN_REFERENCE", record);
    }
  }

  if (context.metadata.recordCount !== context.records.length) {
    throw new SyncValidationError("Manifest record count does not match staged data.", "MANIFEST_MISMATCH", {
      manifestCount: context.metadata.recordCount,
      stagedCount: context.records.length,
    });
  }
}

function validateBbox(record: SyncRecord): void {
  const [minX, minY, maxX, maxY] = record.bbox;
  if (![minX, minY, maxX, maxY].every(Number.isFinite) || minX > maxX || minY > maxY) {
    throw validationError("Record has an invalid bounding box.", "INVALID_BBOX", record);
  }
  const [polandMinX, polandMinY, polandMaxX, polandMaxY] = poland2180Envelope;
  if (minX < polandMinX || minY < polandMinY || maxX > polandMaxX || maxY > polandMaxY) {
    throw validationError("Record bounding box is outside the guarded Poland extent.", "OUTSIDE_POLAND", record);
  }
}

function validationError(message: string, code: SyncValidationError["code"], record: SyncRecord): SyncValidationError {
  return new SyncValidationError(message, code, { objectId: record.objectId });
}
