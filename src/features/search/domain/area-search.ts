export type AreaSearchRankBucket = "code-exact" | "name-exact" | "name-prefix" | "fts";

export type AreaSearchRank = {
  bucket: AreaSearchRankBucket;
  bm25: number;
};

export type AreaSearchResult = {
  rowid: number;
  snapshotId: number;
  layerId: string;
  objectId: string;
  name: string | null;
  normalizedName: string | null;
  code: string | null;
  aliases: string | null;
  rank: AreaSearchRank;
};

export type AreaSearchOptions = {
  query: string;
  code?: string;
  layerId?: string;
  layerIds?: readonly string[];
  snapshotId?: number;
  validOn?: string;
  limit?: number;
};

export function normalizeAreaSearchText(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

export function toAreaFtsQuery(query: string): string | undefined {
  const tokens = normalizeAreaSearchText(query).match(/[\p{L}\p{N}]+/gu);

  if (!tokens || tokens.length === 0) {
    return undefined;
  }

  return tokens.map((token) => `"${token.replaceAll("\"", "\"\"")}"*`).join(" ");
}

export function toAreaSearchRankBucket(rankBucket: number): AreaSearchRankBucket {
  if (rankBucket === 0) {
    return "code-exact";
  }

  if (rankBucket === 1) {
    return "name-exact";
  }

  if (rankBucket === 2) {
    return "name-prefix";
  }

  return "fts";
}
