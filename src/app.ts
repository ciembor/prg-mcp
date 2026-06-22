import { createMcpApp } from "@mcp-craftsman/core";
import { loadRuntimeConfig } from "@mcp-craftsman/node";

import { registry } from "./mcp/registry.js";
import { loadPrgConfig, type PrgConfig } from "./runtime/config.js";

export function createApp(config: PrgConfig = loadPrgConfig(loadRuntimeConfig({ appName: "prg-mcp" }))) {
  const app = createMcpApp({
    name: "prg-mcp",
    version: "0.1.0",
    registry,
  });

  return Object.assign(app, { config });
}
