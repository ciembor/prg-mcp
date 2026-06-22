import { createCapabilityRegistry } from "@mcp-craftsman/core";

import { healthTool } from "../features/health/index.js";

export const registry = createCapabilityRegistry([
  healthTool,
]);
