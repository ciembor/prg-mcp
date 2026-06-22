import type { SafeZipEntry } from "./safe-zip-reader.js";

export type ShpFallbackRole = "shape" | "index" | "attributes" | "projection" | "encoding";

export type ShpFallbackManifest = {
  format: "shp-fallback";
  schemaFingerprint: string;
  datasets: readonly ShpFallbackDataset[];
};

export type ShpFallbackDataset = {
  baseName: string;
  files: Readonly<Partial<Record<ShpFallbackRole, string>>>;
};

export type ShpFallbackOptions = {
  fallbackAllowed: boolean;
  schemaFingerprint?: string;
  allowedSchemaFingerprints: readonly string[];
};

export type ShpFallbackErrorCode =
  | "SHP_FALLBACK_DISABLED"
  | "SHP_SCHEMA_NOT_ALLOWED"
  | "SHP_UNSUPPORTED_FILE"
  | "SHP_INCOMPLETE_DATASET";

export class ShpFallbackError extends Error {
  public constructor(
    public readonly code: ShpFallbackErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ShpFallbackError";
  }
}

const extensionRoles = new Map<string, ShpFallbackRole>([
  [".shp", "shape"],
  [".shx", "index"],
  [".dbf", "attributes"],
  [".prj", "projection"],
  [".cpg", "encoding"],
]);
const requiredRoles: readonly ShpFallbackRole[] = ["shape", "index", "attributes", "projection"];

export function createShpFallbackManifest(entries: readonly Pick<SafeZipEntry, "path">[], options: ShpFallbackOptions): ShpFallbackManifest {
  assertFallbackAllowed(options);
  const datasets = groupShpDatasets(entries);

  return {
    datasets,
    format: "shp-fallback",
    schemaFingerprint: options.schemaFingerprint as string,
  };
}

function assertFallbackAllowed(options: ShpFallbackOptions): asserts options is ShpFallbackOptions & { schemaFingerprint: string } {
  if (!options.fallbackAllowed) {
    throw new ShpFallbackError("SHP_FALLBACK_DISABLED", "SHP fallback must be enabled explicitly.");
  }

  if (!options.schemaFingerprint || !options.allowedSchemaFingerprints.includes(options.schemaFingerprint)) {
    throw new ShpFallbackError("SHP_SCHEMA_NOT_ALLOWED", "SHP fallback requires a known schema fingerprint.");
  }
}

function groupShpDatasets(entries: readonly Pick<SafeZipEntry, "path">[]): ShpFallbackDataset[] {
  const grouped = new Map<string, Partial<Record<ShpFallbackRole, string>>>();

  for (const entry of entries) {
    const { baseName, role } = parseShpPath(entry.path);
    const files = grouped.get(baseName) ?? {};
    files[role] = entry.path;
    grouped.set(baseName, files);
  }

  return [...grouped.entries()].sort(compareDatasetNames).map(([baseName, files]) => toDataset(baseName, files));
}

function parseShpPath(path: string): { baseName: string; role: ShpFallbackRole } {
  const extensionOffset = path.lastIndexOf(".");
  const extension = extensionOffset === -1 ? "" : path.slice(extensionOffset).toLowerCase();
  const role = extensionRoles.get(extension);

  if (!role) {
    throw new ShpFallbackError("SHP_UNSUPPORTED_FILE", `Unsupported SHP fallback file: ${path}`);
  }

  return {
    baseName: path.slice(0, extensionOffset),
    role,
  };
}

function toDataset(baseName: string, files: Partial<Record<ShpFallbackRole, string>>): ShpFallbackDataset {
  const missingRoles = requiredRoles.filter((role) => !files[role]);

  if (missingRoles.length > 0) {
    throw new ShpFallbackError("SHP_INCOMPLETE_DATASET", `SHP dataset ${baseName} is missing ${missingRoles.join(", ")}.`);
  }

  return {
    baseName,
    files,
  };
}

function compareDatasetNames([left]: readonly [string, unknown], [right]: readonly [string, unknown]): number {
  return left.localeCompare(right, "pl");
}
