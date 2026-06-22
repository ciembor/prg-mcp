import { defineZodTool } from "@mcp-craftsman/zod";
import * as z from "zod";

import type { PrgConfig } from "../../../runtime/config.js";
import { syncModes, syncProfiles } from "../../synchronization/index.js";
import { syncData, unavailableSyncDataRunner, type SyncDataRunner } from "../application/sync-data.js";

export function createSyncDataTool(config: PrgConfig, runner: SyncDataRunner = unavailableSyncDataRunner) {
  return defineZodTool({
    annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: true, readOnlyHint: false },
    description: "Explicitly synchronizes selected PRG profiles, layers and TERYT scopes using missing, stale or force mode.",
    handler: async (input) => {
      const result = await syncData(config, input, runner);
      return { structuredContent: { ...result, run: { ...result.run, targets: [...result.run.targets] } } };
    },
    input: z.object({
      archiveYear: z.number().int().optional(),
      layerIds: z.array(z.string()).min(1).optional(),
      mode: z.enum(syncModes).default("missing"),
      profile: z.enum(syncProfiles).optional(),
      teryt: z.array(z.string()).min(1).optional(),
    }).refine((input) => input.profile !== undefined || input.layerIds !== undefined, { message: "profile or layerIds is required" }),
    name: "sync_data",
    output: z.object({
      plan: z.object({ estimatedDiskBytes: z.number().int(), estimatedDownloadBytes: z.number().int(), targetCount: z.number().int() }),
      run: z.object({
        runId: z.string(), status: z.enum(["complete", "partial", "failed"]),
        targets: z.array(z.object({
          datasetKey: z.string(), error: z.string().optional(), recordCount: z.number().int().optional(),
          scope: z.string(), status: z.enum(["published", "unchanged", "failed"]),
        })),
      }),
    }),
    policy: "write",
  });
}
