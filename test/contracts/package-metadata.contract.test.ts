import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

type PackageMetadata = {
  readonly bin: Readonly<Record<string, string>>;
  readonly files: readonly string[];
  readonly license: string;
  readonly engines: {
    readonly node: string;
  };
  readonly name: string;
  readonly private: boolean;
  readonly repository: {
    readonly url: string;
  };
};

describe("npm package metadata contract", () => {
  it("describes a public PRG MCP package", async () => {
    const metadata = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8")) as PackageMetadata;

    expect(metadata).toMatchObject({
      bin: {
        "prg-mcp": "dist/cli.js",
      },
      license: "EUPL-1.2",
      engines: {
        node: ">=22.0.0",
      },
      name: "prg-mcp",
      private: false,
      repository: {
        url: "git+https://github.com/ciembor/prg-mcp.git",
      },
    });
    expect(metadata.files).toEqual(["dist", "CHANGELOG.md", "LICENSE", "NOTICE.md", "README.md"]);
  });
});
