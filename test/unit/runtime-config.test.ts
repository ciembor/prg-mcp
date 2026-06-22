import { describe, expect, it } from "vitest";

import type { RuntimeConfig } from "@mcp-craftsman/node";

import { loadPrgConfig } from "../../src/runtime/config.js";

const runtimeConfig: RuntimeConfig = {
  configDir: "/test/prg-config",
  dataDir: "/test/prg-data",
  logLevel: "info",
  port: 3000,
  transport: "stdio",
};

describe("PRG runtime config", () => {
  it("uses bounded defaults", () => {
    expect(loadPrgConfig(runtimeConfig, {})).toEqual({
      ...runtimeConfig,
      maxDownloadBytes: 4_294_967_296,
      sourceTimeoutMs: 30_000,
      syncConcurrency: 2,
    });
  });

  it("reads PRG-specific environment values", () => {
    expect(
      loadPrgConfig(runtimeConfig, {
        PRG_MAX_DOWNLOAD_BYTES: "1000000",
        PRG_SOURCE_TIMEOUT_MS: "45000",
        PRG_SYNC_CONCURRENCY: "4",
      }),
    ).toMatchObject({
      maxDownloadBytes: 1_000_000,
      sourceTimeoutMs: 45_000,
      syncConcurrency: 4,
    });
  });

  it.each([
    ["PRG_MAX_DOWNLOAD_BYTES", "0"],
    ["PRG_SOURCE_TIMEOUT_MS", "99"],
    ["PRG_SYNC_CONCURRENCY", "9"],
    ["PRG_SYNC_CONCURRENCY", "1.5"],
  ])("rejects invalid %s", (name, value) => {
    expect(() => loadPrgConfig(runtimeConfig, { [name]: value })).toThrow(`${name} must be an integer`);
  });
});
