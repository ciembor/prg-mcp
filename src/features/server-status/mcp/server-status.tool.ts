import { defineZodTool } from "@mcp-craftsman/zod";
import * as z from "zod";

import type { PrgConfig } from "../../../runtime/config.js";
import { getServerStatus } from "../application/get-server-status.js";

export function createServerStatusTool(config: PrgConfig) {
  return defineZodTool({
    annotations: { readOnlyHint: true },
    description: "Returns local database sizes, schema version, transport and required SQLite extension availability.",
    handler: async () => {
      const status = await getServerStatus(config);
      return { structuredContent: { ...status, databases: [...status.databases] } };
    },
    input: z.object({}),
    name: "server_status",
    output: z.object({
      dataDir: z.string(),
      databases: z.array(z.object({ exists: z.boolean(), name: z.string(), sizeBytes: z.number().int() })),
      databaseSchemaVersion: z.number().int(),
      sqlite: z.object({ fts5: z.boolean(), rtree: z.boolean() }),
      totalSizeBytes: z.number().int(),
      transport: z.enum(["stdio", "http"]),
    }),
    policy: "read",
  });
}
