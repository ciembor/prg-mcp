export const prgDatabaseSchemaVersion = 1;

export const prgCanonicalMappingVersion = "2026-06-22";

export const prgVoivodeshipCodes = [
  "02",
  "04",
  "06",
  "08",
  "10",
  "12",
  "14",
  "16",
  "18",
  "20",
  "22",
  "24",
  "26",
  "28",
  "30",
  "32",
] as const;

export type PrgVoivodeshipCode = (typeof prgVoivodeshipCodes)[number];

export type PrgDatabaseKind = "catalog" | "boundaries" | "address-shard";

export type PrgDatabaseSchemaState = {
  readonly kind: PrgDatabaseKind;
  readonly version: number;
  readonly canonicalMappingVersion: string;
};
