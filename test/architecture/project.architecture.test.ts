import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { registry } from "../../src/mcp/registry.js";

const sourceRoot = new URL("../../src/", import.meta.url);

describe("project architecture", () => {
  it("keeps the capability registry valid", () => {
    expect(registry.capabilities.map((capability) => capability.name)).toEqual([
      "about", "get_address", "get_area", "get_area_geometry", "get_street", "health_status", "list_layers", "locate_point", "relate_areas", "reverse_address", "search_addresses", "search_areas", "search_streets", "server_status", "source_status",
    ]);
  });

  it("does not import private framework paths", async () => {
    const sourceFiles = await readSourceFiles(sourceRoot);

    for (const [path, source] of Object.entries(sourceFiles)) {
      expect(source, path).not.toContain("@mcp-craftsman/core/src");
      expect(source, path).not.toContain("@mcp-craftsman/node/src");
      expect(source, path).not.toContain("@mcp-craftsman/cli/src");
    }
  });
});

async function readSourceFiles(root: URL): Promise<Record<string, string>> {
  const entries = await readdir(root, {
    withFileTypes: true,
  });
  const files: Record<string, string> = {};

  for (const entry of entries) {
    const entryUrl = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, root);

    if (entry.isDirectory()) {
      Object.assign(files, await readSourceFiles(entryUrl));
    } else if (entry.name.endsWith(".ts")) {
      files[join(root.pathname, entry.name)] = await readFile(entryUrl, "utf8");
    }
  }

  return files;
}
