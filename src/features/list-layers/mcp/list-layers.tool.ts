import { defineZodTool } from "@mcp-craftsman/zod";
import * as z from "zod";

import type { PrgConfig } from "../../../runtime/config.js";
import { prgGeometryTypes, prgLayerCategories, prgSourceChannels } from "../../source-catalog/index.js";
import { listLayers } from "../application/list-layers.js";

export function createListLayersTool(config: PrgConfig) {
  return defineZodTool({
    annotations: { readOnlyHint: true },
    description: "Lists all 54 PRG layers with purpose, geometry, source channel, local availability, scopes and record counts.",
    handler: async ({ limit }) => ({
      structuredContent: {
        layers: (await listLayers(config)).slice(0, limit).map((layer) => ({ ...layer, installedScopes: [...layer.installedScopes] })),
      },
    }),
    input: z.object({ limit: z.number().int().min(1).max(100).default(100) }),
    name: "list_layers",
    output: z.object({
      layers: z.array(z.object({
        available: z.boolean(), category: z.enum(prgLayerCategories), geometryType: z.enum(prgGeometryTypes),
        installedScopes: z.array(z.string()), layerId: z.string(), recordCount: z.number().int(),
        sourceChannel: z.enum(prgSourceChannels), sourceName: z.string(), titlePl: z.string(), usage: z.string(),
      })),
    }),
    policy: "read",
  });
}
