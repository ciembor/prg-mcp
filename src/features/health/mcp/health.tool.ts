import { defineZodTool } from "@mcp-craftsman/zod";
import * as z from "zod";

import { getHealth } from "../application/get-health.js";

export const healthTool = defineZodTool({
  name: "health_status",
  description: "Returns basic server health.",
  policy: "read",
  input: z.object({}),
  output: z.object({
    ok: z.boolean(),
  }),
  annotations: {
    readOnlyHint: true,
  },
  handler: () => ({
    structuredContent: getHealth(),
  }),
});
