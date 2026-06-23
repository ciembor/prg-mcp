import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { callTool, type Capability } from "@mcp-craftsman/core";
import Database from "better-sqlite3";

import { createApp } from "../../src/app.js";
import { encodeAreaId } from "../../src/features/areas/index.js";
import { initializePrgDatabases } from "../../src/features/persistence/index.js";
import { bboxOfGeometry, centroidOfGeometry, encodeWkb, type PolygonGeometry } from "../../src/features/spatial/index.js";
import { loadPrgConfig } from "../../src/runtime/config.js";

function publicToolInputs(areaId: string): Readonly<Record<string, unknown>> {
  return {
  about: {},
  get_area: { areaId },
  get_area_geometry: { areaId, maxVertices: 100 },
  health_status: {},
  list_layers: {},
  locate_point: { category: "administrative", x: 5, y: 5 },
  relate_areas: { areaId, category: "administrative" },
  search_areas: { category: "administrative", query: "Wieliszew" },
  server_status: {},
  source_status: {},
  sync_data: { mode: "missing", profile: "administrative" },
  };
}

const invalidInputErrors: Readonly<Record<string, string>> = {
  about: "about received invalid input.",
  get_area: "get_area received invalid input.",
  get_area_geometry: "get_area_geometry received invalid input.",
  health_status: "health_status received invalid input.",
  list_layers: "list_layers received invalid input.",
  locate_point: "locate_point received invalid input.",
  relate_areas: "relate_areas received invalid input.",
  search_areas: "search_areas received invalid input.",
  server_status: "server_status received invalid input.",
  source_status: "source_status received invalid input.",
  sync_data: "sync_data received invalid input.",
};

describe("public capability contracts", () => {
  it("covers every public capability", () => {
    const app = createContractApp();

    expect(app.registry.capabilities.map((capability) => capability.name)).toEqual(Object.keys(publicToolInputs(contractAreaId)));
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

    for (const [toolName, input] of Object.entries(publicToolInputs(contractAreaId))) {
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

const contractAreaId = encodeAreaId({ layerId: "A03", objectId: "gmina-wieliszew", snapshotId: 1 });

function createContractApp() {
  const dataDir = mkdtempSync(join(tmpdir(), "prg-mcp-public-contract-"));
  createAreaFixture(dataDir);
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

function createAreaFixture(dataDir: string): void {
  const { boundariesPath } = initializePrgDatabases({ addressShardCodes: ["02"], dataDir });
  const database = new Database(boundariesPath);

  try {
    insertArea(database, 1, "A03", "gmina-wieliszew", square);
    insertArea(database, 2, "A02", "powiat", square);
  } finally {
    database.close();
  }
}

function insertArea(database: Database.Database, rowid: number, layerId: string, objectId: string, geometry: PolygonGeometry): void {
  const bbox = bboxOfGeometry(geometry);
  const centroid = centroidOfGeometry(geometry);
  database
    .prepare(`
      insert into areas (
        rowid, snapshot_id, layer_id, object_id, name, normalized_name, aliases, code,
        centroid_x, centroid_y, min_x, min_y, max_x, max_y, geometry_wkb, source_properties_json
      ) values (
        @rowid, 1, @layerId, @objectId, 'Gmina Wieliszew', 'gmina wieliszew', '', '1408032',
        @centroidX, @centroidY, @minX, @minY, @maxX, @maxY, @geometryWkb, '{}'
      )
    `)
    .run({
      centroidX: centroid.coordinates[0],
      centroidY: centroid.coordinates[1],
      geometryWkb: Buffer.from(encodeWkb(geometry)),
      layerId,
      maxX: bbox.maxX,
      maxY: bbox.maxY,
      minX: bbox.minX,
      minY: bbox.minY,
      objectId,
      rowid,
    });
  database
    .prepare("insert into areas_rtree(rowid, min_x, max_x, min_y, max_y) values (@rowid, @minX, @maxX, @minY, @maxY)")
    .run({ maxX: bbox.maxX, maxY: bbox.maxY, minX: bbox.minX, minY: bbox.minY, rowid });
  database.prepare("insert into areas_fts(rowid, name, normalized_name, code, aliases) values (@rowid, 'Gmina Wieliszew', 'gmina wieliszew', '1408032', '')").run({ rowid });
}

const square: PolygonGeometry = {
  coordinates: [[
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
  ]],
  type: "Polygon",
};
