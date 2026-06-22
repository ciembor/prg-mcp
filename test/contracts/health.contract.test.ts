import { describe, expect, it } from "vitest";

import { callTool } from "@mcp-craftsman/core";

import { createApp } from "../../src/app.js";

describe("health contract", () => {
  it("returns structured health status", async () => {
    await expect(callTool(createApp(), "health_status", {})).resolves.toEqual({
      structuredContent: {
        ok: true,
      },
    });
  });
});
