export {
  classifyTextMatch,
  compareTextMatches,
  defaultTextMatchThresholds,
  normalizePolishSearchText,
  toPolishFtsQuery,
} from "./domain/address-search.js";
export {
  CursorError,
  decodeSnapshotCursor,
  encodeSnapshotCursor,
} from "./domain/opaque-cursor.js";
export type {
  AddressSearchDocument,
  AddressSearchOptions,
  AddressSearchResult,
  StreetSearchResult,
  TextMatch,
  TextMatchMode,
  TextMatchThresholds,
} from "./domain/address-search.js";
export type {
  CursorErrorCode,
  CursorSortValue,
  DecodeSnapshotCursorOptions,
  EncodeSnapshotCursorOptions,
  SnapshotCursorPayload,
} from "./domain/opaque-cursor.js";
export {
  normalizeAreaSearchText,
  toAreaFtsQuery,
  toAreaSearchRankBucket,
} from "./domain/area-search.js";
export type {
  AreaSearchOptions,
  AreaSearchRank,
  AreaSearchRankBucket,
  AreaSearchResult,
} from "./domain/area-search.js";
export {
  compareAddressResults,
  compareStreetResults,
  insertAddressSearchDocument,
  rebuildStreetSearchIndex,
  searchAddresses,
  searchStreets,
} from "./infrastructure/sqlite/address-search-sqlite.js";
export {
  rebuildAreaSearchIndex,
  searchAreaNames,
} from "./infrastructure/sqlite/area-search-sqlite.js";
