export type TextMatchMode = "exact" | "prefix" | "contains" | "fuzzy" | "none";

export type TextMatchThresholds = {
  prefixMinLength: number;
  containsMinLength: number;
  fuzzyMaxDistance: number;
  fuzzyMinSimilarity: number;
};

export type TextMatch = {
  mode: TextMatchMode;
  confidence: number;
  distance?: number;
  normalizedQuery: string;
  normalizedCandidate: string;
};

export type AddressSearchOptions = {
  query: string;
  limit?: number;
};

export type AddressSearchDocument = {
  rowid: number;
  fullAddress: string;
  localityName: string;
  streetName?: string;
  buildingNumber: string;
  postalCode?: string;
};

export type AddressSearchResult = {
  rowid: number;
  objectId: string;
  localityName: string | null;
  streetName: string | null;
  buildingNumber: string;
  postalCode: string | null;
  bm25: number;
  match: TextMatch;
};

export type StreetSearchResult = {
  rowid: number;
  objectId: string;
  name: string;
  normalizedName: string;
  bm25: number;
  match: TextMatch;
};

export const defaultTextMatchThresholds: TextMatchThresholds = {
  containsMinLength: 3,
  fuzzyMaxDistance: 2,
  fuzzyMinSimilarity: 0.78,
  prefixMinLength: 2,
};

const polishCharacterMap: Readonly<Record<string, string>> = {
  ą: "a",
  ć: "c",
  ę: "e",
  ł: "l",
  ń: "n",
  ó: "o",
  ś: "s",
  ź: "z",
  ż: "z",
};

export function normalizePolishSearchText(text: string): string {
  const normalized = text
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/gu, (character) => polishCharacterMap[character] ?? character)
    .replace(/\b(?:ul|ulica)\.?\b/gu, " ulica ")
    .replace(/\b(?:al|aleja)\.?\b/gu, " aleja ")
    .replace(/\b(?:pl|plac)\.?\b/gu, " plac ")
    .replace(/[^\p{L}\p{N}/]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");

  return joinHouseNumberSuffixes(compactSlashSpacing(normalized));
}

export function toPolishFtsQuery(query: string): string | undefined {
  const tokens = normalizePolishSearchText(query).match(/[\p{L}\p{N}]+/gu);

  if (!tokens || tokens.length === 0) {
    return undefined;
  }

  return tokens.map((token) => `"${token.replaceAll("\"", "\"\"")}"*`).join(" ");
}

export function classifyTextMatch(
  query: string,
  candidate: string,
  thresholds: TextMatchThresholds = defaultTextMatchThresholds,
): TextMatch {
  const normalizedQuery = normalizePolishSearchText(query);
  const normalizedCandidate = normalizePolishSearchText(candidate);

  if (normalizedQuery.length === 0 || normalizedCandidate.length === 0) {
    return createTextMatch("none", 0, normalizedQuery, normalizedCandidate);
  }

  if (normalizedCandidate === normalizedQuery) {
    return createTextMatch("exact", 1, normalizedQuery, normalizedCandidate);
  }

  if (normalizedQuery.length >= thresholds.prefixMinLength && normalizedCandidate.startsWith(normalizedQuery)) {
    return createTextMatch("prefix", 0.9, normalizedQuery, normalizedCandidate);
  }

  if (normalizedQuery.length >= thresholds.containsMinLength && normalizedCandidate.includes(normalizedQuery)) {
    return createTextMatch("contains", 0.75, normalizedQuery, normalizedCandidate);
  }

  return classifyFuzzyMatch(normalizedQuery, normalizedCandidate, thresholds);
}

export function compareTextMatches(left: TextMatch, right: TextMatch): number {
  const modeDifference = textMatchModeWeight(left.mode) - textMatchModeWeight(right.mode);

  if (modeDifference !== 0) {
    return modeDifference;
  }

  return right.confidence - left.confidence;
}

function classifyFuzzyMatch(
  normalizedQuery: string,
  normalizedCandidate: string,
  thresholds: TextMatchThresholds,
): TextMatch {
  const distance = levenshteinDistance(normalizedQuery, normalizedCandidate);
  const similarity = 1 - distance / Math.max(normalizedQuery.length, normalizedCandidate.length);

  if (distance <= thresholds.fuzzyMaxDistance && similarity >= thresholds.fuzzyMinSimilarity) {
    return {
      confidence: similarity,
      distance,
      mode: "fuzzy",
      normalizedCandidate,
      normalizedQuery,
    };
  }

  return createTextMatch("none", 0, normalizedQuery, normalizedCandidate, distance);
}

function createTextMatch(
  mode: TextMatchMode,
  confidence: number,
  normalizedQuery: string,
  normalizedCandidate: string,
  distance?: number,
): TextMatch {
  return {
    confidence,
    distance,
    mode,
    normalizedCandidate,
    normalizedQuery,
  };
}

function textMatchModeWeight(mode: TextMatchMode): number {
  if (mode === "exact") {
    return 0;
  }

  if (mode === "prefix") {
    return 1;
  }

  if (mode === "contains") {
    return 2;
  }

  if (mode === "fuzzy") {
    return 3;
  }

  return 4;
}

function compactSlashSpacing(text: string): string {
  let compacted = "";

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (character !== "/") {
      compacted += character;
      continue;
    }

    compacted = compacted.trimEnd();
    compacted += "/";

    while (text[index + 1] === " ") {
      index += 1;
    }
  }

  return compacted;
}

function joinHouseNumberSuffixes(text: string): string {
  const tokens = text.split(" ");
  const joined: string[] = [];

  for (const token of tokens) {
    const previous = joined.at(-1);

    if (previous && isHouseNumberCore(previous) && isSingleAsciiLetter(token)) {
      joined[joined.length - 1] = `${previous}${token}`;
      continue;
    }

    joined.push(token);
  }

  return joined.join(" ");
}

function isHouseNumberCore(value: string): boolean {
  let hasDigit = false;

  for (const character of value) {
    if (character === "/") {
      continue;
    }

    if (!isDigit(character)) {
      return false;
    }

    hasDigit = true;
  }

  return hasDigit;
}

function isSingleAsciiLetter(value: string): boolean {
  return value.length === 1 && value >= "a" && value <= "z";
}

function isDigit(value: string): boolean {
  return value.length === 1 && value >= "0" && value <= "9";
}

function levenshteinDistance(left: string, right: string): number {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const current = [leftIndex + 1];

    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex] === right[rightIndex] ? 0 : 1;
      current[rightIndex + 1] = Math.min(
        current[rightIndex] as number + 1,
        previous[rightIndex + 1] as number + 1,
        previous[rightIndex] as number + substitutionCost,
      );
    }

    previous = current;
  }

  return previous[right.length] as number;
}
