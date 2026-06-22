import { describe, expect, it } from "vitest";

import { callTool, type Capability } from "@mcp-craftsman/core";

import { createApp } from "../../src/app.js";

const publicToolInputs: Readonly<Record<string, unknown>> = {
  health_status: {},
};

const invalidInputErrors: Readonly<Record<string, string>> = {
  health_status: "health_status received invalid input.",
};

describe("public capability contracts", () => {
  it("covers every public capability", () => {
    const app = createApp();

    expect(app.registry.capabilities.map((capability) => capability.name)).toEqual(Object.keys(publicToolInputs));
  });

  it("defines output schemas and consistent annotations", () => {
    const app = createApp();

    for (const tool of app.registry.tools()) {
      expect(tool.outputSchema, tool.name).toBeDefined();
      expect(tool.returnsStructuredContent, tool.name).toBe(true);
      expectAnnotations(tool);
    }
  });

  it("returns structured content for every public tool", async () => {
    const app = createApp();

    for (const [toolName, input] of Object.entries(publicToolInputs)) {
      const result = await callTool(app, toolName, input);

      expect(result, toolName).toHaveProperty("structuredContent");
      expect(result.structuredContent, toolName).toBeDefined();
    }
  });

  it("returns stable errors for invalid public tool input", async () => {
    const app = createApp();

    for (const [toolName, message] of Object.entries(invalidInputErrors)) {
      await expect(callTool(app, toolName, null), toolName).rejects.toMatchObject({
        message,
        name: "Error",
      });
    }
  });

  it("returns stable errors for unknown tool names", async () => {
    await expect(callTool(createApp(), "missing_tool", {})).rejects.toMatchObject({
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
