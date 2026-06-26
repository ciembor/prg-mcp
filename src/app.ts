import { createMcpApp } from "@mcp-craftsman/core";
import { loadRuntimeConfig } from "@mcp-craftsman/node";

import { createRegistry, type RegistryServices } from "./mcp/registry.js";
import { loadPrgConfig, type PrgConfig } from "./runtime/config.js";
import { packageName, packageVersion } from "./runtime/package-metadata.js";

export function createApp(
  config: PrgConfig = loadPrgConfig(loadRuntimeConfig({ appName: "prg-mcp" })),
  services: RegistryServices = {},
) {
  const app = createMcpApp({
    name: packageName,
    version: packageVersion,
    registry: createRegistry(config, services),
  });

  return Object.assign(app, { config });
}
