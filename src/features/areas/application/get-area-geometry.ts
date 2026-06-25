import simplify from "@turf/simplify";

import type { PrgConfig } from "../../../runtime/config.js";
import type { PrgGeometry } from "../../spatial/index.js";
import { AreaToolError } from "./area-model.js";
import { getAreaWithGeometry } from "./get-area.js";

export type AreaGeometryResult = {
  readonly areaId: string;
  readonly snapshotId: number;
  readonly layerId: string;
  readonly crs: "EPSG:2180";
  readonly simplified: boolean;
  readonly vertexCount: number;
  readonly geometry: PrgGeometry;
};

export async function getAreaGeometry(
  config: PrgConfig,
  input: { readonly areaId: string; readonly toleranceMeters?: number; readonly maxVertices?: number },
): Promise<AreaGeometryResult> {
  const area = await getAreaWithGeometry(config, input.areaId);
  const maxVertices = Math.min(input.maxVertices ?? 10_000, 100_000);
  const tolerance = input.toleranceMeters ?? 0;
  const geometry = simplifyToLimit(area.geometry, tolerance, maxVertices);

  return {
    areaId: area.areaId,
    crs: "EPSG:2180",
    geometry,
    layerId: area.layerId,
    simplified: vertexCount(area.geometry) !== vertexCount(geometry),
    snapshotId: area.snapshotId,
    vertexCount: vertexCount(geometry),
  };
}

export function vertexCount(geometry: PrgGeometry): number {
  if (geometry.type === "Point") return 1;
  if (geometry.type === "MultiPoint" || geometry.type === "LineString") return geometry.coordinates.length;
  if (geometry.type === "MultiLineString" || geometry.type === "Polygon") {
    return geometry.coordinates.reduce((sum, line) => sum + line.length, 0);
  }

  return geometry.coordinates.reduce((sum, polygon) => sum + polygon.reduce((polygonSum, ring) => polygonSum + ring.length, 0), 0);
}

function simplifyToLimit(geometry: PrgGeometry, tolerance: number, maxVertices: number): PrgGeometry {
  let simplified = tolerance > 0 ? simplifyGeometry(validateGeoJsonGeometry(geometry), tolerance) : validateGeoJsonGeometry(geometry);
  let currentTolerance = tolerance;

  for (let attempt = 0; vertexCount(simplified) > maxVertices && attempt < 12; attempt += 1) {
    currentTolerance = currentTolerance === 0 ? 1 : currentTolerance * 2;
    simplified = simplifyGeometry(simplified, currentTolerance);
  }

  simplified = validateGeoJsonGeometry(simplified);
  if (vertexCount(simplified) > maxVertices) {
    throw new AreaToolError("VERTEX_LIMIT_EXCEEDED", `Geometry has ${vertexCount(simplified)} vertices after simplification; limit is ${maxVertices}.`);
  }

  return simplified;
}

function simplifyGeometry(geometry: PrgGeometry, tolerance: number): PrgGeometry {
  if (geometry.type === "Point" || geometry.type === "MultiPoint") {
    return geometry;
  }

  const feature = {
    geometry,
    properties: {},
    type: "Feature" as const,
  };

  const simplified = simplify(feature as unknown as Parameters<typeof simplify>[0], { highQuality: true, tolerance }) as unknown as { geometry: PrgGeometry };

  return validateGeoJsonGeometry(simplified.geometry);
}

function validateGeoJsonGeometry(geometry: PrgGeometry): PrgGeometry {
  if (!["Point", "MultiPoint", "LineString", "MultiLineString", "Polygon", "MultiPolygon"].includes(geometry.type)) {
    throw new Error("Unsupported GeoJSON geometry type.");
  }

  return geometry;
}
