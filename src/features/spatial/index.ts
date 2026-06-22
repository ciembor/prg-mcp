export {
  CoordinateTransformError,
} from "./domain/coordinates.js";
export type {
  Epsg2180Point,
  Epsg4326Point,
} from "./domain/coordinates.js";
export {
  epsg2180Code,
  epsg2180Definition,
  epsg4326Code,
  roundTrip2180,
  transform2180To4326,
  transform4326To2180,
} from "./infrastructure/proj4/prg-crs.js";
