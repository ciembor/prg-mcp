import { mkdir, statfs } from "node:fs/promises";
import { join } from "node:path";

import { type CliIo, type McpCliCommand, writeJson } from "@mcp-craftsman/node";
import Database from "better-sqlite3";

import { getAreaGeometry } from "../features/areas/application/get-area-geometry.js";
import { encodeAreaId } from "../features/areas/application/area-model.js";
import { listLayers } from "../features/list-layers/index.js";
import { getServerStatus } from "../features/server-status/index.js";
import { getSourceStatus } from "../features/source-status/index.js";
import { getPrgLayer } from "../features/source-catalog/index.js";
import { planSync, syncProfiles, type SyncProfile } from "../features/synchronization/index.js";
import { transform2180To4326, type PrgGeometry, type Position } from "../features/spatial/index.js";
import type { PrgConfig } from "../runtime/config.js";

type OptionMap = ReadonlyMap<string, readonly string[]>;
type GeoJsonFeature = {
  readonly type: "Feature";
  readonly properties: Readonly<Record<string, unknown>>;
  readonly geometry: PrgGeometry;
};

export function createPrgCliCommands(): readonly McpCliCommand<PrgConfig>[] {
  return [
    command("status", async ({ config, io }) => writeJson(io.stdout, await getServerStatus(config))),
    command("coverage", async ({ config, io }) => writeJson(io.stdout, await runCoverageCommand(config))),
    command("source-status", async ({ args, config, io }) => writeJson(io.stdout, await getSourceStatus(config, readBooleanOption(parseOptions(args), "remote")))),
    command("doctor", async ({ config, io }) => writeJson(io.stdout, await runDoctorCommand(config))),
    command("export", async ({ args, config, io }) => writeJson(io.stdout, await runExportCommand(config, parseOptions(args)))),
    command("setup", async ({ args, config, io }) => writeJson(io.stdout, await runSetupCommand(config, parseOptions(args), io))),
  ];
}

function command(name: string, run: McpCliCommand<PrgConfig>["run"]): McpCliCommand<PrgConfig> {
  return { name, run };
}

async function runCoverageCommand(config: PrgConfig) {
  const layers = await listLayers(config);
  const installed = layers.filter((layer) => layer.available);
  return {
    installedLayerCount: installed.length,
    totalLayerCount: layers.length,
    layers: layers.map((layer) => ({
      available: layer.available,
      installedScopes: layer.installedScopes,
      layerId: layer.layerId,
      recordCount: layer.recordCount,
    })),
  };
}

async function runDoctorCommand(config: PrgConfig) {
  const [status, sourceStatus] = await Promise.all([getServerStatus(config), getSourceStatus(config, false)]);
  const issues = [
    ...(!status.sqlite.fts5 ? ["SQLite FTS5 extension is unavailable."] : []),
    ...(!status.sqlite.rtree ? ["SQLite R-tree extension is unavailable."] : []),
    ...(sourceStatus.installedLayerCount === 0
      ? ["No PRG layers are installed. Data synchronization is not packaged in this build; prepare PRG data with a configured import pipeline."]
      : []),
  ];
  return {
    ok: issues.length === 0,
    dataDir: status.dataDir,
    databaseSchemaVersion: status.databaseSchemaVersion,
    installedLayerCount: sourceStatus.installedLayerCount,
    issues,
    sqlite: status.sqlite,
  };
}

async function runExportCommand(config: PrgConfig, options: OptionMap) {
  const layerId = requireOption(options, "layer");
  const objectId = requireOption(options, "id");
  const format = option(options, "format") ?? "geojson";
  const crs = option(options, "crs") ?? "EPSG:2180";
  if (format !== "geojson") throw new Error("export supports only --format geojson.");
  if (crs !== "EPSG:2180" && crs !== "EPSG:4326") throw new Error("export supports --crs EPSG:2180 or EPSG:4326.");
  const layer = getPrgLayer(layerId);
  if (!layer) throw new Error(`Unknown PRG layer: ${layerId}.`);
  if (layer.sourceChannel !== "wfs" || layer.geometryType === "point") {
    throw new Error(`export supports only PRG boundary and area geometry layers; ${layerId} is not exportable.`);
  }
  const maxVertices = readIntegerOption(options, "max-vertices");
  if (maxVertices !== undefined && maxVertices < 4) throw new Error("--max-vertices must be at least 4.");
  const toleranceMeters = readNumberOption(options, "tolerance-meters");
  if (toleranceMeters !== undefined && toleranceMeters < 0) throw new Error("--tolerance-meters must be at least 0.");

  const snapshotId = readSnapshotId(config, layerId, option(options, "snapshot-id"));
  const result = await getAreaGeometry(config, {
    areaId: encodeAreaId({ layerId, objectId, snapshotId }),
    maxVertices,
    toleranceMeters,
  });
  const geometry = crs === "EPSG:4326" ? transformGeometryTo4326(result.geometry) : result.geometry;
  return {
    crs,
    feature: {
      geometry,
      properties: {
        layerId: result.layerId,
        objectId,
        snapshotId: result.snapshotId,
        simplified: result.simplified,
        vertexCount: result.vertexCount,
      },
      type: "Feature",
    } satisfies GeoJsonFeature,
    format: "geojson",
  };
}

async function runSetupCommand(config: PrgConfig, options: OptionMap, io: CliIo) {
  const profile = (option(options, "profile") ?? "administrative") as SyncProfile;
  if (!isSyncProfile(profile)) throw new Error(`Invalid sync profile: ${profile}.`);
  const confirmFull = option(options, "confirm-poland-full") === "true";
  if (profile === "poland-full" && !confirmFull) {
    throw new Error("poland-full requires --confirm-poland-full. Recommended starter profile is administrative.");
  }
  await mkdir(config.dataDir, { recursive: true });
  const disk = await statfs(config.dataDir);
  const archiveYear = readIntegerOption(options, "archive-year");
  if (profile === "administrative-history" && archiveYear === undefined) {
    throw new Error("administrative-history requires --archive-year.");
  }
  const plan = planSync({
    archiveYear,
    availableDiskBytes: disk.bavail * disk.bsize,
    mode: "missing",
    profile,
    teryt: values(options, "teryt"),
  });
  writeStderr(io, config, `Recommended starter profile: administrative. Planned profile: ${profile}.\n`);
  return {
    estimatedDiskBytes: plan.estimatedDiskBytes,
    estimatedDownloadBytes: plan.estimatedDownloadBytes,
    profile,
    syncAvailable: false,
    syncStatus: "not_packaged",
    targetCount: plan.targets.length,
  };
}

function parseOptions(args: readonly string[]): OptionMap {
  const result = new Map<string, string[]>();
  for (let index = 0; index < args.length; index += 1) {
    const raw = args[index];
    if (!raw?.startsWith("--")) throw new Error(`Unexpected argument: ${raw}.`);
    const [name, inlineValue] = raw.slice(2).split("=", 2) as [string, string?];
    const value = inlineValue ?? (args[index + 1]?.startsWith("--") ? undefined : args[index + 1]);
    if (value !== undefined && inlineValue === undefined) index += 1;
    result.set(name, [...(result.get(name) ?? []), value ?? "true"]);
  }
  return result;
}

function readSnapshotId(config: PrgConfig, layerId: string, explicit: string | undefined): number {
  if (explicit !== undefined) return parseInteger(explicit, "snapshot-id");
  const catalogPath = join(config.dataDir, "catalog.sqlite");
  const database = new Database(catalogPath, { fileMustExist: true, readonly: true });
  try {
    const row = database.prepare(`
      select s.id as snapshotId
      from installed_coverage c join snapshots s on s.id = c.snapshot_id
      where c.layer_id = @layerId
        and c.completeness = 'complete'
      order by s.downloaded_at desc, s.id desc
      limit 1
    `).get({ layerId }) as { snapshotId: number } | undefined;
    if (!row) throw new Error(`No installed snapshot found for layer ${layerId}.`);
    return row.snapshotId;
  } finally {
    database.close();
  }
}

function transformGeometryTo4326(geometry: PrgGeometry): PrgGeometry {
  if (geometry.type === "Point") return { ...geometry, coordinates: transformPosition(geometry.coordinates) };
  if (geometry.type === "MultiPoint" || geometry.type === "LineString") {
    return { ...geometry, coordinates: geometry.coordinates.map(transformPosition) };
  }
  if (geometry.type === "MultiLineString" || geometry.type === "Polygon") {
    return { ...geometry, coordinates: geometry.coordinates.map((line) => line.map(transformPosition)) };
  }
  return { ...geometry, coordinates: geometry.coordinates.map((polygon) => polygon.map((ring) => ring.map(transformPosition))) };
}

function transformPosition(position: Position): Position {
  const point = transform2180To4326({ x: position[0], y: position[1] });
  return [point.longitude, point.latitude];
}

function option(options: OptionMap, name: string): string | undefined {
  return options.get(name)?.at(-1);
}

function values(options: OptionMap, name: string): readonly string[] | undefined {
  const optionValues = options.get(name);
  return optionValues && optionValues.length > 0 ? optionValues : undefined;
}

function requireOption(options: OptionMap, name: string): string {
  const value = option(options, name);
  if (!value) throw new Error(`Missing required option --${name}.`);
  return value;
}

function readIntegerOption(options: OptionMap, name: string): number | undefined {
  const value = option(options, name);
  return value === undefined ? undefined : parseInteger(value, name);
}

function readNumberOption(options: OptionMap, name: string): number | undefined {
  const value = option(options, name);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`--${name} must be a finite number.`);
  return parsed;
}

function readBooleanOption(options: OptionMap, name: string): boolean {
  const value = option(options, name);
  if (value === undefined) return false;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`--${name} must be true or false.`);
}

function parseInteger(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`--${name} must be an integer.`);
  return parsed;
}

function isSyncProfile(value: string): value is SyncProfile {
  return (syncProfiles as readonly string[]).includes(value);
}

function writeStderr(io: CliIo, config: PrgConfig, message: string): void {
  if (config.logLevel !== "silent") io.stderr.write(message);
}
