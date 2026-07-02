import { defineZodTool } from "@mcp-craftsman/zod";
import * as z from "zod";

import type { PrgConfig } from "../../../runtime/config.js";
import { getSourceStatus, operationalSourceStates, type SourceStatusProbe } from "../application/get-source-status.js";

export function createSourceStatusTool(config: PrgConfig, probe?: SourceStatusProbe) {
  return defineZodTool({
    annotations: { readOnlyHint: true },
    description: "Returns local installed PRG coverage by layer and scope; remote metadata is checked only when a source-status probe is configured.",
    handler: async ({ checkRemote }) => {
      const status = await getSourceStatus(config, checkRemote, probe);
      return { structuredContent: { ...status, coverage: [...status.coverage], sources: [...status.sources] } };
    },
    input: z.object({ checkRemote: z.boolean().default(false) }),
    name: "source_status",
    output: z.object({
      checkedRemote: z.boolean(),
      coverage: z.array(z.object({
        completeness: z.string(), datasetKey: z.string(), layerId: z.string(), recordCount: z.number().int().optional(),
        scopeCode: z.string(), scopeType: z.string(), stateDate: z.string().optional(),
      })),
      completeForFullCatalog: z.boolean(),
      installedCoveragePairCount: z.number().int(),
      installedLayerCount: z.number().int(),
      remoteReason: z.string().optional(),
      remoteStatus: z.enum(["checked", "not_requested", "not_configured"]),
      sources: z.array(z.object({ datasetKey: z.string(), status: z.enum(operationalSourceStates) })),
      totalLayerCount: z.number().int(),
    }),
    policy: "read",
  });
}
