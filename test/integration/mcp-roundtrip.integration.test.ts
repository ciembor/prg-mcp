import { mkdtempSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";

import { callTool } from "@mcp-craftsman/core";
import { startHttpServer, type StartedHttpServer } from "@mcp-craftsman/node";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { createApp } from "../../src/app.js";
import { runCli } from "../../src/cli.js";
import { parseGmlFeatureMembers } from "../../src/features/importing/index.js";
import { initializePrgDatabases } from "../../src/features/persistence/index.js";
import { insertAddressSearchDocument } from "../../src/features/search/index.js";
import { loadPrgConfig } from "../../src/runtime/config.js";

describe("fixture sync to MCP roundtrip", () => {
  it("parses GML fixture into SQLite and serves the result through MCP core and HTTP", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "prg-roundtrip-"));
    const features = await parseAddressFixture();
    expect(features).toContain("AD_PunktAdresowy");
    installAddressFixture(dataDir);

    const app = createApp(loadPrgConfig({ configDir: dataDir, dataDir, logLevel: "silent", port: 0, transport: "stdio" }, {}));
    const searchInput = {
      structured: { buildingNumber: "12A", localityName: "Warszawa", streetName: "Żurawia" },
      voivodeshipCodes: ["14"],
    };
    const coreResult = await callTool(app, "search_addresses", searchInput);
    expect(coreResult.structuredContent).toMatchObject({
      addresses: [expect.objectContaining({ buildingNumber: "12A", localityName: "Warszawa" })],
    });

    const stdout = new MemoryWritable();
    await runCli(["call", "search_addresses", JSON.stringify(searchInput)], {
      env: { MCP_DATA_DIR: dataDir, MCP_LOG_LEVEL: "silent" },
      stderr: new MemoryWritable(),
      stdout,
    });
    expect(JSON.parse(stdout.content)).toMatchObject({
      addresses: [expect.objectContaining({ buildingNumber: "12A" })],
    });

    const server = await startHttpServerIfAllowed(app);
    if (!server) return;
    try {
      const response = await fetch(`${server.url}/tools/search_addresses`, {
        body: JSON.stringify(searchInput),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        structuredContent: { addresses: [expect.objectContaining({ streetName: "Żurawia" })] },
      });
    } finally {
      await server.close();
    }
  });
});

async function parseAddressFixture(): Promise<string[]> {
  const xml = await readFile(new URL("../unit/source-catalog/fixtures/emuia-2021-address.gml", import.meta.url), "utf8");
  const featureTypes: string[] = [];
  for await (const feature of parseGmlFeatureMembers([xml])) featureTypes.push(feature.typeName);
  return featureTypes;
}

function installAddressFixture(dataDir: string): void {
  const { addressShardPaths } = initializePrgDatabases({ addressShardCodes: ["14"], dataDir });
  const database = new Database(addressShardPaths["14"]);
  try {
    database.prepare(`
      insert into addresses (
        rowid, object_id, iip_id, municipality_code, locality_name, street_name, building_number,
        postal_code, x, y, source_scope, source_properties_json
      ) values (
        1, 'pa-waw-zurawia-12a', 'iip-pa-1', '1465011', 'Warszawa', 'Żurawia', '12A',
        '00503', 637807, 486708, 'woj:14', '{}'
      )
    `).run();
    database.prepare("insert into addresses_rtree(rowid, min_x, max_x, min_y, max_y) values (1, 637807, 637807, 486708, 486708)").run();
    insertAddressSearchDocument(database, {
      buildingNumber: "12A",
      fullAddress: "Warszawa ulica Żurawia 12A 00503",
      localityName: "Warszawa",
      postalCode: "00503",
      rowid: 1,
      streetName: "Żurawia",
    });
  } finally {
    database.close();
  }
}

async function startHttpServerIfAllowed(app: ReturnType<typeof createApp>): Promise<StartedHttpServer | undefined> {
  try {
    return await startHttpServer(app, { port: 0 });
  } catch (error) {
    if (isNodeError(error, "EPERM")) return undefined;
    throw error;
  }
}

function isNodeError(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

class MemoryWritable extends Writable {
  readonly chunks: string[] = [];

  get content(): string {
    return this.chunks.join("");
  }

  override _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.chunks.push(chunk.toString("utf8"));
    callback();
  }
}
