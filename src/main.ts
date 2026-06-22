import { serveMcpApp } from "@mcp-craftsman/node";

import { createApp } from "./app.js";

await serveMcpApp(createApp);
