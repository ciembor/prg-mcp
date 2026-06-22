import { defineZodTool } from "@mcp-craftsman/zod";
import * as z from "zod";

import { getAbout } from "../application/get-about.js";

export const aboutTool = defineZodTool({
  annotations: { readOnlyHint: true },
  description: "Returns package identity, scope, repository, author and database schema version.",
  handler: () => ({ structuredContent: getAbout() }),
  input: z.object({}),
  name: "about",
  output: z.object({
    author: z.object({ email: z.string(), name: z.string() }),
    databaseSchemaVersion: z.number().int(),
    description: z.string(),
    name: z.string(),
    repository: z.string(),
    version: z.string(),
  }),
  policy: "read",
});
