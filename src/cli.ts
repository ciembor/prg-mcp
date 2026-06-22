#!/usr/bin/env node
import { createDefaultCliIo, createMcpCli, isCliEntrypoint, type CliIo } from "@mcp-craftsman/node";

import { createApp } from "./app.js";
import { loadPrgConfig } from "./runtime/config.js";

export async function runCli(argv: readonly string[] = process.argv.slice(2), io: CliIo = createDefaultCliIo()) {
  const cli = createMcpCli({
    appName: "prg-mcp",
    createApp: (runtimeConfig) => createApp(loadPrgConfig(runtimeConfig, io.env)),
  });

  await cli.run(argv, io);
}

if (isCliEntrypoint("prg-mcp")) {
  runCli().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
