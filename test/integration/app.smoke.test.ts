import { describe, expect, it } from "vitest";

import { createApp } from "../../src/app.js";

describe("app", () => {
  it("creates an MCP app", () => {
    const app = createApp();

    expect(app.registry.get("health_status")).toBeDefined();
  });
});
