export {
  GmlSecurityError,
} from "./domain/gml-feature.js";
export type {
  GmlCoordinateGeometry,
  GmlCoordinateGeometryType,
  GmlFeature,
} from "./domain/gml-feature.js";
export {
  parseGmlFeatureMembers,
} from "./infrastructure/gml/stream-gml-parser.js";
export {
  detectEmuiaSchemaVersion,
  mapEmuiaAddressPoint,
  mapEmuiaFeature,
  mapEmuiaStreet,
} from "./infrastructure/emuia/emuia-adapters.js";
export type {
  EmuiaAddressPoint,
  EmuiaFeature,
  EmuiaLineStringGeometry,
  EmuiaPointGeometry,
  EmuiaSchemaVersion,
  EmuiaStreet,
} from "./infrastructure/emuia/emuia-adapters.js";
