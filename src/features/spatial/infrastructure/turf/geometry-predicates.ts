import booleanIntersects from "@turf/boolean-intersects";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";

import type {
  MultiPolygonGeometry,
  PointGeometry,
  PolygonGeometry,
  Position,
  PrgGeometry,
} from "../../domain/geometry.js";

export function geometriesIntersect(left: PrgGeometry, right: PrgGeometry): boolean {
  return booleanIntersects(toFeature(left) as never, toFeature(right) as never);
}

export function pointCoveredByPolygon(point: PointGeometry | Position, polygon: PolygonGeometry | MultiPolygonGeometry): boolean {
  const pointGeometry: PointGeometry = isPosition(point)
    ? {
        coordinates: point,
        type: "Point" as const,
      }
    : point;

  return booleanPointInPolygon(toFeature(pointGeometry) as never, toFeature(polygon) as never, {
    ignoreBoundary: false,
  });
}

function toFeature(geometry: PrgGeometry): {
  type: "Feature";
  properties: Record<string, never>;
  geometry: PrgGeometry;
} {
  return {
    geometry,
    properties: {},
    type: "Feature",
  };
}

function isPosition(value: PointGeometry | Position): value is Position {
  return Array.isArray(value);
}
