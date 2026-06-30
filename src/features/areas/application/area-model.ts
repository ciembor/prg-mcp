import { Buffer } from "node:buffer";

import type Database from "better-sqlite3";

import { decodeWkb } from "../../spatial/index.js";
import { getPrgLayer, type PrgLayer, type PrgLayerCategory } from "../../source-catalog/index.js";
import type { PrgGeometry } from "../../spatial/index.js";

export type AreaIdentifier = {
  readonly snapshotId: number;
  readonly layerId: string;
  readonly objectId: string;
};

export type AreaRow = {
  readonly rowid: number;
  readonly snapshot_id: number;
  readonly layer_id: string;
  readonly object_id: string;
  readonly name: string | null;
  readonly normalized_name: string | null;
  readonly aliases: string | null;
  readonly code: string | null;
  readonly iip_id: string | null;
  readonly regon: string | null;
  readonly valid_from: string | null;
  readonly valid_to: string | null;
  readonly version_from: string | null;
  readonly version_to: string | null;
  readonly area_m2: number | null;
  readonly centroid_x: number | null;
  readonly centroid_y: number | null;
  readonly min_x: number;
  readonly min_y: number;
  readonly max_x: number;
  readonly max_y: number;
  readonly geometry_wkb: Buffer;
  readonly source_properties_json: string;
};

export type AreaSummary = {
  readonly areaId: string;
  readonly snapshotId: number;
  readonly layerId: string;
  readonly layerTitle: string;
  readonly category: PrgLayerCategory;
  readonly objectId: string;
  readonly name: string | null;
  readonly code: string | null;
  readonly iipId: string | null;
  readonly regon: string | null;
  readonly validFrom: string | null;
  readonly validTo: string | null;
  readonly centroid: readonly [number, number] | null;
  readonly bbox: readonly [number, number, number, number];
  readonly attributes: Record<string, unknown>;
};

export type AreaWithGeometry = AreaSummary & {
  readonly geometry: PrgGeometry;
};

export class AreaToolError extends Error {
  public constructor(
    public readonly code: "AREA_NOT_FOUND" | "INVALID_AREA_ID" | "INVALID_INPUT" | "SNAPSHOT_MISMATCH" | "UNBOUNDED_SCAN_REFUSED" | "COST_LIMIT_EXCEEDED" | "VERTEX_LIMIT_EXCEEDED",
    message: string,
  ) {
    super(message);
    this.name = "AreaToolError";
  }
}

export function encodeAreaId(identifier: AreaIdentifier): string {
  return Buffer.from(JSON.stringify(identifier), "utf8").toString("base64url");
}

export function decodeAreaId(areaId: string): AreaIdentifier {
  try {
    const parsed = JSON.parse(Buffer.from(areaId, "base64url").toString("utf8")) as Partial<AreaIdentifier>;

    if (
      typeof parsed.snapshotId !== "number"
      || !Number.isInteger(parsed.snapshotId)
      || parsed.snapshotId <= 0
      || typeof parsed.layerId !== "string"
      || parsed.layerId.length === 0
      || !getPrgLayer(parsed.layerId)
      || typeof parsed.objectId !== "string"
      || parsed.objectId.length === 0
    ) {
      throw new Error("Invalid area identifier payload.");
    }

    return {
      layerId: parsed.layerId,
      objectId: parsed.objectId,
      snapshotId: parsed.snapshotId as number,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown parse error";

    throw new AreaToolError("INVALID_AREA_ID", `Invalid area identifier: ${reason}`);
  }
}

export function readAreaById(database: Database.Database, areaId: string): AreaRow {
  const identifier = decodeAreaId(areaId);
  const row = database
    .prepare(`
      select *
      from areas
      where snapshot_id = @snapshotId
        and layer_id = @layerId
        and object_id = @objectId
      limit 1
    `)
    .get(identifier) as AreaRow | undefined;

  if (!row) {
    throw new AreaToolError("AREA_NOT_FOUND", "Area was not found in the selected snapshot.");
  }

  return row;
}

export function toAreaSummary(row: AreaRow): AreaSummary {
  const layer = requireLayer(row.layer_id);

  return {
    areaId: encodeAreaId({ layerId: row.layer_id, objectId: row.object_id, snapshotId: row.snapshot_id }),
    attributes: parseSourceProperties(row.source_properties_json),
    bbox: [row.min_x, row.min_y, row.max_x, row.max_y],
    category: layer.category,
    centroid: row.centroid_x === null || row.centroid_y === null ? null : [row.centroid_x, row.centroid_y],
    code: row.code,
    iipId: row.iip_id,
    layerId: row.layer_id,
    layerTitle: layer.titlePl,
    name: row.name,
    objectId: row.object_id,
    regon: row.regon,
    snapshotId: row.snapshot_id,
    validFrom: row.valid_from,
    validTo: row.valid_to,
  };
}

export function toAreaWithGeometry(row: AreaRow): AreaWithGeometry {
  return {
    ...toAreaSummary(row),
    geometry: decodeWkb(row.geometry_wkb),
  };
}

export function whereValidOnClause(validOn?: string): string {
  if (!validOn) {
    return "";
  }

  return "and (valid_from is null or valid_from <= @validOn) and (valid_to is null or valid_to >= @validOn)";
}

export function assertValidOn(toolName: string, validOn: string | undefined): void {
  if (validOn === undefined) {
    return;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/u.test(validOn)) {
    throw new AreaToolError("INVALID_INPUT", `${toolName} validOn must use YYYY-MM-DD format.`);
  }

  const [year, month, day] = validOn.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 0) - 1, day ?? 0));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== (month ?? 0) - 1 || date.getUTCDate() !== day) {
    throw new AreaToolError("INVALID_INPUT", `${toolName} validOn must be a real calendar date.`);
  }
}

function requireLayer(layerId: string): PrgLayer {
  const layer = getPrgLayer(layerId);

  if (!layer) {
    throw new AreaToolError("AREA_NOT_FOUND", `Unknown PRG layer: ${layerId}.`);
  }

  return layer;
}

function parseSourceProperties(json: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(json) as unknown;

    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
