import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("generator-first workflow contract", () => {
  it("exposes the framework feature generator as a project command", async () => {
    const packageJson = JSON.parse(
      await readFile(new URL("../../package.json", import.meta.url), "utf8"),
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.["generate:feature"]).toBe("mcp-craftsman generate feature");
  });

  it("documents generator commands and tracks manual exceptions", async () => {
    const workflow = await readFile(
      new URL("../../docs/generator-workflow.md", import.meta.url),
      "utf8",
    );

    expect(workflow).toContain("pnpm generate:feature -- <name>");
    expect(workflow).toContain("../mcp-craftsman");
    expect(workflow).toContain("Rejestr odstępstw");
  });
});
