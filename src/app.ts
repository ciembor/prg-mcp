import { createMcpApp } from "@mcp-craftsman/core";

import { registry } from "./mcp/registry.js";

export function createApp() {
  return createMcpApp({
    name: "prg-mcp",
    version: "0.1.0",
    registry,
  });
}
