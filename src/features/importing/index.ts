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
  readSafeZipEntries,
  ZipSafetyError,
} from "./infrastructure/archive/safe-zip-reader.js";
export type {
  SafeZipEntry,
  SafeZipReaderOptions,
  ZipSafetyErrorCode,
} from "./infrastructure/archive/safe-zip-reader.js";
export {
  createShpFallbackManifest,
  ShpFallbackError,
} from "./infrastructure/archive/shp-fallback-adapter.js";
export type {
  ShpFallbackDataset,
  ShpFallbackErrorCode,
  ShpFallbackManifest,
  ShpFallbackOptions,
  ShpFallbackRole,
} from "./infrastructure/archive/shp-fallback-adapter.js";
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
