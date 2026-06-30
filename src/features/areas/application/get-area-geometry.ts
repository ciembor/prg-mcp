import { isDeepStrictEqual } from "node:util";

import simplify from "@turf/simplify";

import type { PrgConfig } from "../../../runtime/config.js";
import type { Position, PrgGeometry } from "../../spatial/index.js";
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
  validateGetAreaGeometryInput(input);
  const area = await getAreaWithGeometry(config, input.areaId);
  const maxVertices = Math.min(input.maxVertices ?? 10_000, 100_000);
  const tolerance = input.toleranceMeters ?? 0;
  const geometry = simplifyToLimit(area.geometry, tolerance, maxVertices);
  const originalVertexCount = vertexCount(area.geometry);
  const finalVertexCount = vertexCount(geometry);

  return {
    areaId: area.areaId,
    crs: "EPSG:2180",
    geometry,
    layerId: area.layerId,
    simplified: originalVertexCount !== finalVertexCount || !isDeepStrictEqual(area.geometry, geometry),
    snapshotId: area.snapshotId,
    vertexCount: finalVertexCount,
  };
}

function validateGetAreaGeometryInput(input: { readonly toleranceMeters?: number; readonly maxVertices?: number }): void {
  if (input.maxVertices !== undefined && (!Number.isInteger(input.maxVertices) || input.maxVertices < 4)) {
    throw new AreaToolError("INVALID_INPUT", "get_area_geometry maxVertices must be an integer of at least 4.");
  }

  if (input.toleranceMeters !== undefined && (!Number.isFinite(input.toleranceMeters) || input.toleranceMeters < 0)) {
    throw new AreaToolError("INVALID_INPUT", "get_area_geometry toleranceMeters must be at least 0.");
  }
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
    throw new AreaToolError("INVALID_INPUT", "Unsupported GeoJSON geometry type.");
  }

  validateGeometryCoordinates(geometry);

  return geometry;
}

function validateGeometryCoordinates(geometry: PrgGeometry): void {
  if (geometry.type === "Point") {
    validatePosition(geometry.coordinates);
    return;
  }

  if (geometry.type === "MultiPoint") {
    if (geometry.coordinates.length === 0) throw invalidGeometry("MultiPoint has no coordinates.");
    geometry.coordinates.forEach(validatePosition);
    return;
  }

  if (geometry.type === "LineString") {
    validateLineString(geometry.coordinates);
    return;
  }

  if (geometry.type === "MultiLineString") {
    if (geometry.coordinates.length === 0) throw invalidGeometry("MultiLineString has no lines.");
    geometry.coordinates.forEach(validateLineString);
    return;
  }

  if (geometry.type === "Polygon") {
    validatePolygon(geometry.coordinates);
    return;
  }

  if (geometry.coordinates.length === 0) throw invalidGeometry("MultiPolygon has no polygons.");
  geometry.coordinates.forEach(validatePolygon);
}

function validatePolygon(rings: readonly (readonly Position[])[]): void {
  if (rings.length === 0) throw invalidGeometry("Polygon has no rings.");
  for (const ring of rings) {
    if (ring.length < 4) throw invalidGeometry("Polygon ring has fewer than 4 positions.");
    ring.forEach(validatePosition);
    const first = ring[0];
    const last = ring.at(-1);
    if (!first || !last || first[0] !== last[0] || first[1] !== last[1]) {
      throw invalidGeometry("Polygon ring is not closed.");
    }
  }
}

function validateLineString(line: readonly Position[]): void {
  if (line.length < 2) throw invalidGeometry("LineString has fewer than 2 positions.");
  line.forEach(validatePosition);
}

function validatePosition(position: Position): void {
  if (position.length !== 2 || !Number.isFinite(position[0]) || !Number.isFinite(position[1])) {
    throw invalidGeometry("Geometry contains an invalid position.");
  }
}

function invalidGeometry(message: string): Error {
  return new AreaToolError("INVALID_INPUT", message);
}
