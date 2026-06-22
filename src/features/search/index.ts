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
  rebuildAreaSearchIndex,
  searchAreaNames,
} from "./infrastructure/sqlite/area-search-sqlite.js";
