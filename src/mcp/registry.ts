import { createCapabilityRegistry } from "@mcp-craftsman/core";
import { loadRuntimeConfig } from "@mcp-craftsman/node";

import { aboutTool } from "../features/about/index.js";
import {
  createGetAreaGeometryTool,
  createGetAreaTool,
  createLocatePointTool,
  createRelateAreasTool,
  createSearchAreasTool,
} from "../features/areas/index.js";
import { healthTool } from "../features/health/index.js";
import { createListLayersTool } from "../features/list-layers/index.js";
import { createServerStatusTool } from "../features/server-status/index.js";
import { createSourceStatusTool, type SourceStatusProbe } from "../features/source-status/index.js";
import { createSyncDataTool, type SyncDataRunner } from "../features/sync-data/index.js";
import { loadPrgConfig, type PrgConfig } from "../runtime/config.js";

export type RegistryServices = { readonly sourceStatusProbe?: SourceStatusProbe; readonly syncDataRunner?: SyncDataRunner };

export function createRegistry(config: PrgConfig, services: RegistryServices = {}) {
  return createCapabilityRegistry([
    aboutTool,
    createGetAreaTool(config),
    createGetAreaGeometryTool(config),
    healthTool,
    createListLayersTool(config),
    createLocatePointTool(config),
    createRelateAreasTool(config),
    createSearchAreasTool(config),
    createServerStatusTool(config),
    createSourceStatusTool(config, services.sourceStatusProbe),
    createSyncDataTool(config, services.syncDataRunner),
  ]);
}

export const registry = createRegistry(loadPrgConfig(loadRuntimeConfig({ appName: "prg-mcp" })));
