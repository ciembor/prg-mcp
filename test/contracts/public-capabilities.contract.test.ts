import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { callTool, type Capability } from "@mcp-craftsman/core";
import Database from "better-sqlite3";

import { createApp } from "../../src/app.js";
import { encodeAddressId, encodeStreetId } from "../../src/features/addresses/index.js";
import { encodeAreaId } from "../../src/features/areas/index.js";
import { initializePrgDatabases } from "../../src/features/persistence/index.js";
import { insertAddressSearchDocument, rebuildStreetSearchIndex } from "../../src/features/search/index.js";
import { bboxOfGeometry, centroidOfGeometry, encodeWkb, type LineStringGeometry, type PolygonGeometry } from "../../src/features/spatial/index.js";
import { loadPrgConfig } from "../../src/runtime/config.js";

function publicToolInputs(areaId: string, addressId: string, streetId: string): Readonly<Record<string, unknown>> {
  return {
  about: {},
  get_address: { addressId },
  get_area: { areaId },
  get_area_geometry: { areaId, maxVertices: 100 },
  get_street: { streetId },
  health_status: {},
  list_layers: {},
  locate_point: { category: "administrative", x: 5, y: 5 },
  relate_areas: { areaId, category: "administrative" },
  reverse_address: { radiusMeters: 10, voivodeshipCodes: ["14"], x: 637807, y: 486708 },
  search_addresses: { query: "Warszawa Żurawia 12A", voivodeshipCodes: ["14"] },
  search_areas: { category: "administrative", query: "Wieliszew" },
  search_streets: { query: "Żurawia", voivodeshipCodes: ["14"] },
  server_status: {},
  source_status: {},
  };
}

const invalidInputErrors: Readonly<Record<string, string>> = {
  about: "about received invalid input.",
  get_address: "get_address received invalid input.",
  get_area: "get_area received invalid input.",
  get_area_geometry: "get_area_geometry received invalid input.",
  get_street: "get_street received invalid input.",
  health_status: "health_status received invalid input.",
  list_layers: "list_layers received invalid input.",
  locate_point: "locate_point received invalid input.",
  relate_areas: "relate_areas received invalid input.",
  reverse_address: "reverse_address received invalid input.",
  search_addresses: "search_addresses received invalid input.",
  search_areas: "search_areas received invalid input.",
  search_streets: "search_streets received invalid input.",
  server_status: "server_status received invalid input.",
  source_status: "source_status received invalid input.",
};

describe("public capability contracts", () => {
  it("covers every public capability", () => {
    const app = createContractApp();

    expect(app.registry.capabilities.map((capability) => capability.name)).toEqual(Object.keys(publicToolInputs(contractAreaId, contractAddressId, contractStreetId)));
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

    for (const [toolName, input] of Object.entries(publicToolInputs(contractAreaId, contractAddressId, contractStreetId))) {
      const result = await callTool(app, toolName, input);

      expect(result, toolName).toHaveProperty("structuredContent");
      expect(result.structuredContent, toolName).toBeDefined();
    }
  });

  it("adds data provenance and coverage metadata to every PRG data result", async () => {
    const app = createContractApp();

    for (const [toolName, input] of Object.entries(dataResultToolInputs(contractAreaId, contractAddressId, contractStreetId))) {
      const result = await callTool(app, toolName, input);

      expect(result.structuredContent, toolName).toMatchObject({
        coverage: {
          complete: true,
          missingScopes: [],
        },
        datasetState: "installed",
        source: {
          system: "PRG",
        },
      });
      expect(result.structuredContent, toolName).toHaveProperty("syncedAt");
      expect((result.structuredContent as { coverage: { installedScopes: string[] } }).coverage.installedScopes.length, toolName).toBeGreaterThan(0);
      expect((result.structuredContent as { source: { layerIds: string[] } }).source.layerIds.length, toolName).toBeGreaterThan(0);
    }
  });

  it("does not report missing local data as an empty result", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "prg-mcp-missing-data-contract-"));
    const app = createApp(loadPrgConfig({ configDir: dataDir, dataDir, logLevel: "silent", port: 0, transport: "stdio" }, {}));

    await expect(callTool(app, "search_areas", { category: "administrative", query: "Wieliszew" })).rejects.toMatchObject({
      code: "DATA_NOT_INSTALLED",
      name: "DataNotInstalledError",
    });
    await expect(callTool(app, "search_addresses", { query: "Warszawa Żurawia 12A", voivodeshipCodes: ["14"] })).rejects.toMatchObject({
      code: "DATA_NOT_INSTALLED",
      name: "DataNotInstalledError",
    });
  });

  it("reports unconstrained address coverage as incomplete when only selected shards are installed", async () => {
    const result = await callTool(createContractApp(), "search_addresses", { query: "Warszawa Żurawia 12A" });

    expect(result.structuredContent).toMatchObject({
      coverage: {
        complete: false,
      },
      datasetState: "installed",
    });
    expect((result.structuredContent as { coverage: { missingScopes: string[] } }).coverage.missingScopes).toContain("voivodeship:02");
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

function dataResultToolInputs(areaId: string, addressId: string, streetId: string): Readonly<Record<string, unknown>> {
  const inputs = publicToolInputs(areaId, addressId, streetId);

  return {
    get_address: inputs.get_address,
    get_area: inputs.get_area,
    get_area_geometry: inputs.get_area_geometry,
    get_street: inputs.get_street,
    locate_point: { layerIds: ["A03"], x: 5, y: 5 },
    relate_areas: { areaId, layerIds: ["A03"] },
    reverse_address: inputs.reverse_address,
    search_addresses: inputs.search_addresses,
    search_areas: { layerId: "A03", query: "Wieliszew" },
    search_streets: inputs.search_streets,
  };
}

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
const contractAddressId = encodeAddressId({ objectId: "pa-waw-zurawia-12a", voivodeshipCode: "14" });
const contractStreetId = encodeStreetId({ objectId: "ul-zurawia", voivodeshipCode: "14" });

function createContractApp() {
  const dataDir = mkdtempSync(join(tmpdir(), "prg-mcp-public-contract-"));
  createAreaFixture(dataDir);
  createAddressFixture(dataDir);
  return createApp(loadPrgConfig({ configDir: dataDir, dataDir, logLevel: "silent", port: 0, transport: "stdio" }, {}));
}

function createAreaFixture(dataDir: string): void {
  const { boundariesPath, catalogPath } = initializePrgDatabases({ addressShardCodes: ["02", "14"], dataDir });
  const catalog = new Database(catalogPath);
  try {
    catalog.prepare(`
      insert into snapshots(id, dataset_key, scope, state_date, state_date_key, downloaded_at, checked_at, sha256, record_count, schema_fingerprint, adapter_version, source_url)
      values (1, 'current:A03', 'country:PL', null, '', '2026-06-23', '2026-06-23', 'current', 1, 'schema', '1', 'https://example.test')
    `).run();
    catalog.prepare(`
      insert into installed_coverage(layer_id,dataset_key,archive_year,scope_type,scope_code,snapshot_id,completeness)
      values ('A03','current:A03',0,'country','PL',1,'complete')
    `).run();
  } finally {
    catalog.close();
  }

  const database = new Database(boundariesPath);

  try {
    insertArea(database, 1, "A03", "gmina-wieliszew", square);
    insertArea(database, 2, "A02", "powiat", square);
  } finally {
    database.close();
  }
}

function createAddressFixture(dataDir: string): void {
  const { addressShardPaths } = initializePrgDatabases({ addressShardCodes: ["14"], dataDir });
  const database = new Database(addressShardPaths["14"]);

  try {
    database
      .prepare(`
        insert into addresses (
          rowid, object_id, iip_id, municipality_code, locality_name, street_name, building_number,
          postal_code, x, y, source_scope, source_properties_json
        ) values (
          1, 'pa-waw-zurawia-12a', 'iip-pa-1', '1465011', 'Warszawa', 'Żurawia', '12A',
          '00503', 637807, 486708, 'woj:14', '{}'
        )
      `)
      .run();
    database
      .prepare("insert into addresses_rtree(rowid, min_x, max_x, min_y, max_y) values (1, 637807, 637807, 486708, 486708)")
      .run();
    insertAddressSearchDocument(database, {
      buildingNumber: "12A",
      fullAddress: "Warszawa ulica Żurawia 12A 00503",
      localityName: "Warszawa",
      postalCode: "00503",
      rowid: 1,
      streetName: "Żurawia",
    });
    insertStreet(database);
    rebuildStreetSearchIndex(database);
  } finally {
    database.close();
  }
}

function insertStreet(database: Database.Database): void {
  const geometry: LineStringGeometry = {
    coordinates: [
      [637000, 486000],
      [638000, 487000],
    ],
    type: "LineString",
  };
  const bbox = bboxOfGeometry(geometry);

  database
    .prepare(`
      insert into streets (
        rowid, object_id, name, normalized_name, min_x, min_y, max_x, max_y, geometry_wkb
      ) values (
        1, 'ul-zurawia', 'Żurawia', 'zurawia', @minX, @minY, @maxX, @maxY, @geometryWkb
      )
    `)
    .run({
      geometryWkb: Buffer.from(encodeWkb(geometry)),
      maxX: bbox.maxX,
      maxY: bbox.maxY,
      minX: bbox.minX,
      minY: bbox.minY,
    });
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
