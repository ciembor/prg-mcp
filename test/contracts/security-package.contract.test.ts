import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { registry } from "../../src/mcp/registry.js";

describe("security and package contracts", () => {
  it("does not expose arbitrary source URL input through public MCP tools", () => {
    for (const tool of registry.tools()) {
      expect(JSON.stringify(tool.inputSchema), tool.name).not.toMatch(/\b(url|uri|href|sourceUrl)\b/iu);
    }
  });

  it("keeps pack smoke and dependency audit entry points available", async () => {
    const packageJson = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts).toMatchObject({
      "security:audit": "pnpm audit --audit-level high",
      "test:pack-smoke": "node scripts/pack-smoke.mjs",
      quality: "mcp-craftsman quality",
    });
  });
});
