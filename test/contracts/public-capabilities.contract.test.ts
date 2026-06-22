import { describe, expect, it } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { callTool, type Capability } from "@mcp-craftsman/core";

import { createApp } from "../../src/app.js";
import { loadPrgConfig } from "../../src/runtime/config.js";

const publicToolInputs: Readonly<Record<string, unknown>> = {
  about: {},
  health_status: {},
  list_layers: {},
  server_status: {},
  source_status: {},
  sync_data: { mode: "missing", profile: "administrative" },
};

const invalidInputErrors: Readonly<Record<string, string>> = {
  about: "about received invalid input.",
  health_status: "health_status received invalid input.",
  list_layers: "list_layers received invalid input.",
  server_status: "server_status received invalid input.",
  source_status: "source_status received invalid input.",
  sync_data: "sync_data received invalid input.",
};

describe("public capability contracts", () => {
  it("covers every public capability", () => {
    const app = createContractApp();

    expect(app.registry.capabilities.map((capability) => capability.name)).toEqual(Object.keys(publicToolInputs));
  });

  it("defines output schemas and consistent annotations", () => {
    const app = createContractApp();

    for (const tool of app.registry.tools()) {
      expect(tool.outputSchema, tool.name).toBeDefined();
      expect(tool.returnsStructuredContent, tool.name).toBe(true);
      expectAnnotations(tool);
    }
  });

  it("returns structured content for every public tool", async () => {
    const app = createContractApp();

    for (const [toolName, input] of Object.entries(publicToolInputs)) {
      const result = await callTool(app, toolName, input);

      expect(result, toolName).toHaveProperty("structuredContent");
      expect(result.structuredContent, toolName).toBeDefined();
    }
  });

  it("returns stable errors for invalid public tool input", async () => {
    const app = createContractApp();

    for (const [toolName, message] of Object.entries(invalidInputErrors)) {
      await expect(callTool(app, toolName, null), toolName).rejects.toMatchObject({
        message,
        name: "Error",
      });
    }
  });

  it("returns stable errors for unknown tool names", async () => {
    await expect(callTool(createContractApp(), "missing_tool", {})).rejects.toMatchObject({
      message: "Tool \"missing_tool\" is not registered.",
      name: "Error",
    });
  });
});

function expectAnnotations(tool: Capability): void {
  if (tool.policy === "read") {
    expect(tool.annotations, tool.name).toMatchObject({
      readOnlyHint: true,
    });
    return;
  }

  expect(tool.annotations, tool.name).toMatchObject({
    destructiveHint: false,
    readOnlyHint: false,
  });
}

function createContractApp() {
  const dataDir = join(tmpdir(), "prg-mcp-public-contract");
  return createApp(loadPrgConfig({ configDir: dataDir, dataDir, logLevel: "silent", port: 0, transport: "stdio" }, {}), {
    syncDataRunner: {
      run: async (plan) => ({
        runId: "contract-run",
        status: "complete",
        targets: plan.targets.map((target) => ({
          datasetKey: target.datasetKey,
          scope: `${target.scope.type}:${target.scope.code}`,
          status: "unchanged",
        })),
      }),
    },
  });
}
