export {
  CoordinateTransformError,
} from "./domain/coordinates.js";
export {
  bboxOfGeometry,
  centroidOfGeometry,
  toRtreeRow,
  toSqliteRtreeValues,
} from "./domain/geometry.js";
export type {
  Epsg2180Point,
  Epsg4326Point,
} from "./domain/coordinates.js";
export type {
  BoundingBox,
  LineStringGeometry,
  MultiLineStringGeometry,
  MultiPointGeometry,
  MultiPolygonGeometry,
  PointGeometry,
  PolygonGeometry,
  Position,
  PrgGeometry,
  RtreeRow,
} from "./domain/geometry.js";
export {
  decodeWkb,
  encodeWkb,
  WkbError,
} from "./domain/wkb.js";
export {
  geometriesIntersect,
  pointCoveredByPolygon,
} from "./infrastructure/turf/geometry-predicates.js";
export {
  epsg2180Code,
  epsg2180Definition,
  epsg4326Code,
  roundTrip2180,
  transform2180To4326,
  transform4326To2180,
} from "./infrastructure/proj4/prg-crs.js";
