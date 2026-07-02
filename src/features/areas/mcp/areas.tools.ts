import { join } from "node:path";

import { defineZodTool } from "@mcp-craftsman/zod";
import Database from "better-sqlite3";
import * as z from "zod";

import type { PrgConfig } from "../../../runtime/config.js";
import { databaseTableHasRows } from "../../../shared/data-result.js";
import { createDataResultMetadata } from "../../../shared/data-result.js";
import { getPrgLayer, listPrgLayers, prgLayerCategories } from "../../source-catalog/index.js";
import type { AreaSummary } from "../application/area-model.js";
import { getArea } from "../application/get-area.js";
import { getAreaGeometry } from "../application/get-area-geometry.js";
import { locatePoint } from "../application/locate-point.js";
import { relateAreas } from "../application/relate-areas.js";
import { searchAreas } from "../application/search-areas.js";

const areaLayerCategories = prgLayerCategories.filter((category) => category !== "address");
const categorySchema = z.enum(prgLayerCategories);
const areaCategorySchema = z.enum(areaLayerCategories);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const areaSummarySchema = z.object({
  areaId: z.string(),
  attributes: z.record(z.string(), z.unknown()),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  category: categorySchema,
  centroid: z.tuple([z.number(), z.number()]).nullable(),
  code: z.string().nullable(),
  iipId: z.string().nullable(),
  layerId: z.string(),
  layerTitle: z.string(),
  name: z.string().nullable(),
  objectId: z.string(),
  regon: z.string().nullable(),
  snapshotId: z.number().int(),
  validFrom: z.string().nullable(),
  validTo: z.string().nullable(),
});

const dataResultMetadataSchema = z.object({
  coverage: z.object({
    complete: z.boolean(),
    installedPairs: z.array(z.string()),
    installedScopes: z.array(z.string()),
    missingScopes: z.array(z.string()),
  }),
  datasetState: z.enum(["installed", "not_installed", "unknown"]),
  source: z.object({
    channels: z.array(z.string()),
    layerIds: z.array(z.string()),
    system: z.literal("PRG"),
  }),
  syncedAt: z.string().nullable(),
});

const geometrySchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.object({ coordinates: z.tuple([z.number(), z.number()]), type: z.literal("Point") }),
    z.object({ coordinates: z.array(z.tuple([z.number(), z.number()])), type: z.literal("MultiPoint") }),
    z.object({ coordinates: z.array(z.tuple([z.number(), z.number()])), type: z.literal("LineString") }),
    z.object({ coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))), type: z.literal("MultiLineString") }),
    z.object({ coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))), type: z.literal("Polygon") }),
    z.object({ coordinates: z.array(z.array(z.array(z.tuple([z.number(), z.number()])))), type: z.literal("MultiPolygon") }),
  ]),
);

export function createSearchAreasTool(config: PrgConfig) {
  return defineZodTool({
    annotations: { readOnlyHint: true },
    description: "Searches PRG area/territorial-competence records by text, code, category, layer, validity date and snapshot.",
    handler: async (input) => {
      const result = await searchAreas(config, input);

      return { structuredContent: { areas: result.areas.map(toMutableAreaSummary), ...areaMetadata(config, input) } };
    },
    input: z.object({
      category: areaCategorySchema.optional(),
      code: z.string().min(1).optional(),
      layerId: z.string().min(1).optional(),
      limit: z.number().int().min(1).max(100).default(20),
      query: z.string().trim().min(1).optional(),
      snapshotId: z.number().int().positive().optional(),
      validOn: dateSchema.optional(),
    }),
    name: "search_areas",
    output: z.object({ areas: z.array(areaSummarySchema) }).extend(dataResultMetadataShape),
    policy: "read",
  });
}

export function createGetAreaTool(config: PrgConfig) {
  return defineZodTool({
    annotations: { readOnlyHint: true },
    description: "Returns one PRG area record with mapped common attributes and raw source attributes, without full geometry.",
    handler: async ({ areaId }) => {
      const area = await getArea(config, areaId);
      return { structuredContent: { area: toMutableAreaSummary(area), ...areaMetadata(config, { layerId: area.layerId, snapshotId: area.snapshotId }) } };
    },
    input: z.object({ areaId: z.string().min(1) }),
    name: "get_area",
    output: z.object({ area: areaSummarySchema }).extend(dataResultMetadataShape),
    policy: "read",
  });
}

export function createGetAreaGeometryTool(config: PrgConfig) {
  return defineZodTool({
    annotations: { readOnlyHint: true },
    description: "Returns PRG area geometry as GeoJSON in EPSG:2180, with optional simplification and vertex limit.",
    handler: async (input) => {
      const result = await getAreaGeometry(config, input);
      return { structuredContent: { ...result, ...areaMetadata(config, { layerId: result.layerId, snapshotId: result.snapshotId }) } };
    },
    input: z.object({
      areaId: z.string().min(1),
      maxVertices: z.number().int().min(4).max(100_000).default(10_000),
      toleranceMeters: z.number().min(0).max(10_000).default(0),
    }),
    name: "get_area_geometry",
    output: z.object({
      areaId: z.string(),
      crs: z.literal("EPSG:2180"),
      geometry: geometrySchema,
      layerId: z.string(),
      simplified: z.boolean(),
      snapshotId: z.number().int(),
      vertexCount: z.number().int(),
    }).extend(dataResultMetadataShape),
    policy: "read",
  });
}

export function createLocatePointTool(config: PrgConfig) {
  return defineZodTool({
    annotations: { readOnlyHint: true },
    description: "Finds all polygon areas covering an EPSG:2180 point; boundary points are included with covers semantics.",
    handler: async (input) => {
      const result = await locatePoint(config, input);

      return {
        structuredContent: {
          matches: result.matches.map(toMutableAreaSummary),
          point: [...result.point] as [number, number],
          ...areaMetadata(config, { ...input, polygonOnly: true }),
        },
      };
    },
    input: z.object({
      category: areaCategorySchema.optional(),
      layerIds: z.array(z.string().min(1)).min(1).max(54).optional(),
      limit: z.number().int().min(1).max(100).default(20),
      maxCandidates: z.number().int().min(1).max(10_000).default(2_000),
      snapshotId: z.number().int().positive().optional(),
      validOn: dateSchema.optional(),
      x: z.number().finite(),
      y: z.number().finite(),
    }),
    name: "locate_point",
    output: z.object({ matches: z.array(areaSummarySchema), point: z.tuple([z.number(), z.number()]) }).extend(dataResultMetadataShape),
    policy: "read",
  });
}

export function createRelateAreasTool(config: PrgConfig) {
  return defineZodTool({
    annotations: { readOnlyHint: true },
    description: "Finds bounded intersecting PRG areas/lines for one source area; requires layerIds or category and enforces a candidate cost limit.",
    handler: async (input) => {
      const result = await relateAreas(config, input);

      return {
        structuredContent: {
          matches: result.matches.map(toMutableAreaSummary),
          relation: result.relation,
          ...areaMetadata(config, { ...input, snapshotId: result.sourceArea.snapshotId }),
          sourceArea: toMutableAreaSummary(result.sourceArea),
        },
      };
    },
    input: z.object({
      areaId: z.string().min(1),
      category: areaCategorySchema.optional(),
      layerIds: z.array(z.string().min(1)).min(1).max(54).optional(),
      limit: z.number().int().min(1).max(100).default(20),
      maxCandidates: z.number().int().min(1).max(10_000).default(1_000),
      snapshotId: z.number().int().positive().optional(),
      validOn: dateSchema.optional(),
    }).refine((input) => input.category || (input.layerIds && input.layerIds.length > 0), {
      message: "relate_areas requires category or layerIds.",
    }),
    name: "relate_areas",
    output: z.object({ matches: z.array(areaSummarySchema), relation: z.literal("intersects"), sourceArea: areaSummarySchema }).extend(dataResultMetadataShape),
    policy: "read",
  });
}

const dataResultMetadataShape = dataResultMetadataSchema.shape;

function areaMetadata(
  config: PrgConfig,
  input: { readonly layerId?: string; readonly layerIds?: readonly string[]; readonly category?: string; readonly polygonOnly?: boolean; readonly snapshotId?: number },
) {
  let layerIds: readonly string[];

  if (input.layerId) {
    const layer = getPrgLayer(input.layerId);
    layerIds = isMetadataAreaLayer(layer, input.polygonOnly) ? [input.layerId] : [];
  } else if (input.layerIds && input.layerIds.length > 0) {
    layerIds = input.layerIds.filter((layerId) => isMetadataAreaLayer(getPrgLayer(layerId), input.polygonOnly));
  } else {
    layerIds = listPrgLayers()
      .filter((layer) => isMetadataAreaLayer(layer, input.polygonOnly) && (!input.category || layer.category === input.category))
      .map((layer) => layer.layerId);
  }

  const channels = layerIds.map((layerId) => getPrgLayer(layerId)?.sourceChannel ?? "wfs");
  const fallbackCoverage = fallbackAreaCoverage(config, layerIds);

  return createDataResultMetadata(config, {
    channels,
    datasetKeys: input.snapshotId === undefined ? layerIds.map((layerId) => `current:${layerId}`) : undefined,
    fallbackCoverage,
    layerIds,
    requestedScopes: ["country:PL"],
    snapshotIds: input.snapshotId === undefined ? undefined : [input.snapshotId],
  });
}

function isMetadataAreaLayer(layer: ReturnType<typeof getPrgLayer>, polygonOnly: boolean | undefined): boolean {
  return Boolean(layer?.sourceChannel === "wfs" && (!polygonOnly || layer.geometryType === "polygon"));
}

function fallbackAreaCoverage(config: PrgConfig, layerIds: readonly string[]): Array<{ readonly layerId: string; readonly scope: string }> {
  if (!databaseTableHasRows(config, "boundaries.sqlite", "areas")) {
    return [];
  }

  const installedLayerIds = new Set(listInstalledAreaLayerIds(config));
  return layerIds
    .filter((layerId) => installedLayerIds.has(layerId))
    .map((layerId) => ({ layerId, scope: "country:PL" }));
}

function listInstalledAreaLayerIds(config: PrgConfig): readonly string[] {
  const database = new Database(join(config.dataDir, "boundaries.sqlite"), { readonly: true });
  try {
    return (database.prepare("select distinct layer_id as layerId from areas order by layer_id").all() as Array<{ layerId: string }>)
      .map((row) => row.layerId);
  } finally {
    database.close();
  }
}

function toMutableAreaSummary(area: AreaSummary) {
  return {
    ...area,
    bbox: [...area.bbox] as [number, number, number, number],
    centroid: area.centroid ? ([...area.centroid] as [number, number]) : null,
  };
}
