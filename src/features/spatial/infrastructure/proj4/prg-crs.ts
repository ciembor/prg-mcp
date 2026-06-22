import proj4 from "proj4";

import {
  CoordinateTransformError,
  type Epsg2180Point,
  type Epsg4326Point,
} from "../../domain/coordinates.js";

export const epsg2180Code = "EPSG:2180";
export const epsg4326Code = "EPSG:4326";
export const epsg2180Definition =
  "+proj=tmerc +lat_0=0 +lon_0=19 +k=0.9993 +x_0=500000 +y_0=-5300000 +ellps=GRS80 +units=m +no_defs +type=crs";

proj4.defs(epsg2180Code, epsg2180Definition);

export function transform2180To4326(point: Epsg2180Point): Epsg4326Point {
  assertFinitePoint(point.x, point.y, epsg2180Code);
  const [longitude, latitude] = proj4(epsg2180Code, "WGS84", [point.x, point.y]);
  const transformed = {
    latitude: latitude as number,
    longitude: longitude as number,
  };
  assertWgs84Point(transformed);

  return transformed;
}

export function transform4326To2180(point: Epsg4326Point): Epsg2180Point {
  assertWgs84Point(point);
  const [x, y] = proj4("WGS84", epsg2180Code, [point.longitude, point.latitude]);
  const transformed = {
    x: x as number,
    y: y as number,
  };
  assertFinitePoint(transformed.x, transformed.y, epsg2180Code);

  return transformed;
}

export function roundTrip2180(point: Epsg2180Point): Epsg2180Point {
  return transform4326To2180(transform2180To4326(point));
}

function assertWgs84Point(point: Epsg4326Point): void {
  assertFinitePoint(point.longitude, point.latitude, epsg4326Code);

  if (point.longitude < -180 || point.longitude > 180 || point.latitude < -90 || point.latitude > 90) {
    throw new CoordinateTransformError(`Invalid ${epsg4326Code} point: longitude=${point.longitude}, latitude=${point.latitude}.`);
  }
}

function assertFinitePoint(first: number, second: number, code: string): void {
  if (!Number.isFinite(first) || !Number.isFinite(second)) {
    throw new CoordinateTransformError(`Invalid ${code} point: coordinates must be finite numbers.`);
  }
}
