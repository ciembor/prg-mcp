import { serveMcpApp } from "@mcp-craftsman/node";

import { createApp } from "./app.js";
import { loadPrgConfig } from "./runtime/config.js";

await serveMcpApp((runtimeConfig) => createApp(loadPrgConfig(runtimeConfig)));
