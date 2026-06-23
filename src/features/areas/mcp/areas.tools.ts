import { defineZodTool } from "@mcp-craftsman/zod";
import * as z from "zod";

import type { PrgConfig } from "../../../runtime/config.js";
import { prgLayerCategories } from "../../source-catalog/index.js";
import type { AreaSummary } from "../application/area-model.js";
import { getArea } from "../application/get-area.js";
import { getAreaGeometry } from "../application/get-area-geometry.js";
import { locatePoint } from "../application/locate-point.js";
import { relateAreas } from "../application/relate-areas.js";
import { searchAreas } from "../application/search-areas.js";

const categorySchema = z.enum(prgLayerCategories);
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

      return { structuredContent: { areas: result.areas.map(toMutableAreaSummary) } };
    },
    input: z.object({
      category: categorySchema.optional(),
      code: z.string().min(1).optional(),
      layerId: z.string().min(1).optional(),
      limit: z.number().int().min(1).max(100).default(20),
      query: z.string().min(1).optional(),
      snapshotId: z.number().int().positive().optional(),
      validOn: dateSchema.optional(),
    }),
    name: "search_areas",
    output: z.object({ areas: z.array(areaSummarySchema) }),
    policy: "read",
  });
}

export function createGetAreaTool(config: PrgConfig) {
  return defineZodTool({
    annotations: { readOnlyHint: true },
    description: "Returns one PRG area record with mapped common attributes and raw source attributes, without full geometry.",
    handler: async ({ areaId }) => ({ structuredContent: { area: toMutableAreaSummary(await getArea(config, areaId)) } }),
    input: z.object({ areaId: z.string().min(1) }),
    name: "get_area",
    output: z.object({ area: areaSummarySchema }),
    policy: "read",
  });
}

export function createGetAreaGeometryTool(config: PrgConfig) {
  return defineZodTool({
    annotations: { readOnlyHint: true },
    description: "Returns PRG area geometry as GeoJSON in EPSG:2180, with optional simplification and vertex limit.",
    handler: async (input) => ({ structuredContent: await getAreaGeometry(config, input) }),
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
    }),
    policy: "read",
  });
}

export function createLocatePointTool(config: PrgConfig) {
  return defineZodTool({
    annotations: { readOnlyHint: true },
    description: "Finds all polygon areas covering an EPSG:2180 point; boundary points are included with covers semantics.",
    handler: async (input) => {
      const result = await locatePoint(config, input);

      return { structuredContent: { matches: result.matches.map(toMutableAreaSummary), point: [...result.point] as [number, number] } };
    },
    input: z.object({
      category: categorySchema.optional(),
      layerIds: z.array(z.string().min(1)).max(54).optional(),
      limit: z.number().int().min(1).max(100).default(20),
      snapshotId: z.number().int().positive().optional(),
      validOn: dateSchema.optional(),
      x: z.number().finite(),
      y: z.number().finite(),
    }),
    name: "locate_point",
    output: z.object({ matches: z.array(areaSummarySchema), point: z.tuple([z.number(), z.number()]) }),
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
          source: toMutableAreaSummary(result.source),
        },
      };
    },
    input: z.object({
      areaId: z.string().min(1),
      category: categorySchema.optional(),
      layerIds: z.array(z.string().min(1)).max(54).optional(),
      limit: z.number().int().min(1).max(100).default(20),
      maxCandidates: z.number().int().min(1).max(10_000).default(1_000),
      snapshotId: z.number().int().positive().optional(),
      validOn: dateSchema.optional(),
    }).refine((input) => input.category || (input.layerIds && input.layerIds.length > 0), {
      message: "relate_areas requires category or layerIds.",
    }),
    name: "relate_areas",
    output: z.object({ matches: z.array(areaSummarySchema), relation: z.literal("intersects"), source: areaSummarySchema }),
    policy: "read",
  });
}

function toMutableAreaSummary(area: AreaSummary) {
  return {
    ...area,
    bbox: [...area.bbox] as [number, number, number, number],
    centroid: area.centroid ? ([...area.centroid] as [number, number]) : null,
  };
}
