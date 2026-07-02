import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { callTool } from "@mcp-craftsman/core";

import { createApp } from "../../../src/app.js";
import { encodeAreaId, getArea, getAreaGeometry, locatePoint, relateAreas, searchAreas, vertexCount } from "../../../src/features/areas/index.js";
import { initializePrgDatabases } from "../../../src/features/persistence/index.js";
import { bboxOfGeometry, centroidOfGeometry, encodeWkb, type LineStringGeometry, type PolygonGeometry, type PrgGeometry } from "../../../src/features/spatial/index.js";
import { loadPrgConfig, type PrgConfig } from "../../../src/runtime/config.js";

describe("P5 area tools", () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(temporaryDirectories.map((directory) => rm(directory, { force: true, recursive: true })));
    temporaryDirectories.length = 0;
  });

  it("searches areas by text, category, code, validity and snapshot", async () => {
    const { config } = await createAreaFixture();

    await expect(searchAreas(config, { category: "administrative", query: "Wieliszew", snapshotId: 1, validOn: "2026-01-01" })).resolves.toMatchObject({
      areas: [
        {
          category: "administrative",
          code: "1408032",
          layerId: "A03",
          name: "Gmina Wieliszew",
          snapshotId: 1,
        },
      ],
    });

    await expect(searchAreas(config, { code: "1408032", snapshotId: 2 })).resolves.toMatchObject({
      areas: [{ name: "Gmina Wieliszew 2025", snapshotId: 2 }],
    });
    await expect(searchAreas(config, { code: "1408032" })).resolves.toMatchObject({ areas: [] });
    await expect(searchAreas(config, { query: "   ", snapshotId: 1 })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(searchAreas(config, { code: "1408032", query: "nietrafiajacy tekst", snapshotId: 2 })).resolves.toMatchObject({ areas: [] });
    await expect(searchAreas(config, { code: "Gmina Wieliszew", snapshotId: 1 })).resolves.toMatchObject({ areas: [] });
    await expect(searchAreas(config, { category: "address", query: "Wieliszew", snapshotId: 1 })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(searchAreas(config, { layerId: "A07", query: "Wieliszew", snapshotId: 1 })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(searchAreas(config, { layerId: "NOPE", query: "Wieliszew", snapshotId: 1 })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(searchAreas(config, { category: "administrative", query: "Wieliszew", validOn: "2026-99-99" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(searchAreas(config, {})).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("uses catalog current snapshots instead of max snapshot id for area queries", async () => {
    const { config } = await createAreaFixture();
    const catalog = new Database(join(config.dataDir, "catalog.sqlite"));
    try {
      catalog.prepare(`
        insert into snapshots(id, dataset_key, scope, state_date, state_date_key, downloaded_at, checked_at, sha256, record_count, schema_fingerprint, adapter_version, source_url)
        values (1, 'current:A03', 'country:PL', null, '', '2026-06-23', '2026-06-23', 'current', 1, 'schema', '1', 'https://example.test')
      `).run();
      catalog.prepare(`
        insert into snapshots(id, dataset_key, scope, state_date, state_date_key, downloaded_at, checked_at, sha256, record_count, schema_fingerprint, adapter_version, source_url, archive_year)
        values (2, 'archive:2024:A03', 'country:PL', '2024-01-01', '2024-01-01', '2026-06-24', '2026-06-24', 'archive', 1, 'schema', '1', 'https://example.test', 2024)
      `).run();
      catalog.prepare(`
        insert into installed_coverage(layer_id,dataset_key,archive_year,scope_type,scope_code,snapshot_id,completeness)
        values ('A03','current:A03',0,'country','PL',1,'complete'), ('A03','archive:2024:A03',2024,'country','PL',2,'complete')
      `).run();
    } finally {
      catalog.close();
    }

    await expect(searchAreas(config, { code: "1408032", layerId: "A03" })).resolves.toMatchObject({
      areas: [{ name: "Gmina Wieliszew", snapshotId: 1 }],
    });
    await expect(locatePoint(config, { layerIds: ["A03"], x: 5, y: 5 })).resolves.toMatchObject({
      matches: [{ objectId: "gmina-wieliszew", snapshotId: 1 }],
    });
  });

  it("keeps golden area queries for administrative, court, prosecution, police, tax, forest and maritime layers", async () => {
    const { config } = await createAreaFixture();

    await expect(searchAreas(config, { category: "administrative", query: "Mazowieckie", snapshotId: 1 })).resolves.toMatchObject({ areas: [{ layerId: "A01" }] });
    await expect(searchAreas(config, { category: "administrative", query: "Legionowski", snapshotId: 1 })).resolves.toMatchObject({ areas: [{ layerId: "A02" }] });
    await expect(searchAreas(config, { category: "court", query: "Sąd Rejonowy", snapshotId: 1 })).resolves.toMatchObject({ areas: [{ layerId: "S03" }] });
    await expect(searchAreas(config, { category: "prosecution", query: "Prokuratura Rejonowa", snapshotId: 1 })).resolves.toMatchObject({ areas: [{ layerId: "P03" }] });
    await expect(searchAreas(config, { category: "service", query: "Komenda Powiatowa", snapshotId: 1 })).resolves.toMatchObject({ areas: [{ layerId: "K02" }] });
    await expect(searchAreas(config, { category: "office", query: "Urząd Skarbowy", snapshotId: 1 })).resolves.toMatchObject({ areas: [{ layerId: "U02" }] });
    await expect(searchAreas(config, { category: "office", query: "Nadleśnictwo", snapshotId: 1 })).resolves.toMatchObject({ areas: [{ layerId: "U06" }] });
    await expect(searchAreas(config, { category: "maritime", query: "Morze Terytorialne", snapshotId: 1 })).resolves.toMatchObject({ areas: [{ layerId: "W02" }] });
  });

  it("gets common area attributes and full geometry with simplification metadata", async () => {
    const { config, gminaAreaId } = await createAreaFixture();

    await expect(getArea(config, gminaAreaId)).resolves.toMatchObject({
      areaId: gminaAreaId,
      attributes: { jpt_kod_je: "1408032" },
      bbox: [0, 0, 10, 10],
      layerTitle: "Granice gmin",
      objectId: "gmina-wieliszew",
    });

    const geometry = await getAreaGeometry(config, { areaId: gminaAreaId, maxVertices: 5, toleranceMeters: 1 });

    expect(geometry.crs).toBe("EPSG:2180");
    expect(geometry.layerId).toBe("A03");
    expect(geometry.vertexCount).toBeLessThanOrEqual(vertexCount(square));
    await expect(getAreaGeometry(config, { areaId: gminaAreaId, maxVertices: 4, toleranceMeters: 0 })).rejects.toMatchObject({
      code: "VERTEX_LIMIT_EXCEEDED",
    });
    await expect(getAreaGeometry(config, { areaId: gminaAreaId, maxVertices: 100_001 })).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
  });

  it("does not treat an empty initialized boundaries database as installed data", async () => {
    const directory = await mkdtemp(join(tmpdir(), "prg-empty-boundaries-"));
    temporaryDirectories.push(directory);
    initializePrgDatabases({ addressShardCodes: ["02"], dataDir: directory });
    const config = loadPrgConfig({ configDir: directory, dataDir: directory, logLevel: "silent", port: 0, transport: "stdio" }, {});

    await expect(searchAreas(config, { category: "administrative", query: "Wieliszew" })).rejects.toMatchObject({
      code: "DATA_NOT_INSTALLED",
    });
  });

  it("locates all overlapping territorial competences and includes boundary points", async () => {
    const { config } = await createAreaFixture();

    const result = await locatePoint(config, { category: "administrative", snapshotId: 1, x: 10, y: 5 });

    expect(result.matches.map((match) => [match.layerId, match.objectId])).toEqual([
      ["A01", "woj-mazowieckie"],
      ["A02", "pow-legionowski"],
      ["A03", "gmina-wieliszew"],
    ]);
    await expect(locatePoint(config, { category: "administrative", maxCandidates: 2, snapshotId: 1, x: 10, y: 5 })).rejects.toMatchObject({
      code: "COST_LIMIT_EXCEEDED",
    });
    await expect(locatePoint(config, { category: "administrative", maxCandidates: 10_001, snapshotId: 1, x: 10, y: 5 })).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    await expect(locatePoint(config, { layerIds: ["A01", "A02", "A03"], maxCandidates: 3, snapshotId: 1, x: 10, y: 5 })).resolves.toMatchObject({
      matches: [{ layerId: "A01" }, { layerId: "A02" }, { layerId: "A03" }],
    });
    await expect(locatePoint(config, { layerIds: ["W01"], snapshotId: 1, x: 10, y: 5 })).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    await expect(locatePoint(config, { layerIds: ["NOPE"], snapshotId: 1, x: 10, y: 5 })).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    await expect(locatePoint(config, { layerIds: [], snapshotId: 1, x: 10, y: 5 })).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    await expect(locatePoint(config, { category: "administrative", validOn: "abc", x: 10, y: 5 })).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    await expect(locatePoint(config, { category: "unknown" as never, snapshotId: 1, x: 10, y: 5 })).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
  });

  it("reports locate_point metadata only for searchable polygon layers", async () => {
    const { config } = await createAreaFixture();

    const result = (await callTool(createApp(config), "locate_point", { category: "maritime", snapshotId: 1, x: 5, y: 5 })).structuredContent as {
      source: { layerIds: string[] };
    };

    expect(result.source.layerIds).toContain("W02");
    expect(result.source.layerIds).not.toContain("W01");
    expect(result.source.layerIds).not.toContain("W06");
  });

  it("uses local fallback metadata for returned area snapshots missing from the catalog", async () => {
    const { config, gminaAreaId } = await createAreaFixture();

    const result = (await callTool(createApp(config), "get_area", { areaId: gminaAreaId })).structuredContent as {
      datasetState: string;
      syncedAt: string | null;
      coverage: { complete: boolean; installedScopes: string[] };
    };

    expect(result.datasetState).toBe("installed");
    expect(result.syncedAt).toBeNull();
    expect(result.coverage).toMatchObject({ complete: true, installedScopes: ["country:PL"] });
  });

  it("relates bounded surfaces and lines and rejects unbounded scans at the MCP-schema level", async () => {
    const { config, gminaAreaId } = await createAreaFixture();

    const result = await relateAreas(config, { areaId: gminaAreaId, layerIds: ["W01"], snapshotId: 1 });

    expect(result.sourceArea.objectId).toBe("gmina-wieliszew");
    expect(result.matches.map((match) => [match.layerId, match.objectId])).toEqual([["W01", "linia-testowa"]]);
    await expect(relateAreas(config, { areaId: gminaAreaId })).rejects.toMatchObject({ code: "UNBOUNDED_SCAN_REFUSED" });
    await expect(relateAreas(config, { areaId: gminaAreaId, layerIds: ["A07"] })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(relateAreas(config, { areaId: gminaAreaId, category: "administrative", layerIds: [] })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(relateAreas(config, { areaId: gminaAreaId, category: "unknown" as never })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(relateAreas(config, { areaId: gminaAreaId, layerIds: ["A03"], maxCandidates: 10_001 })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(relateAreas(config, { areaId: gminaAreaId, layerIds: ["A03"], validOn: "2026-02-31" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  async function createAreaFixture(): Promise<{ config: PrgConfig; gminaAreaId: string }> {
    const directory = await mkdtemp(join(tmpdir(), "prg-area-tools-"));
    temporaryDirectories.push(directory);
    const { boundariesPath } = initializePrgDatabases({ addressShardCodes: ["02"], dataDir: directory });
    const database = new Database(boundariesPath);

    try {
      insertArea(database, {
        code: "14",
        geometry: bigSquare,
        layerId: "A01",
        name: "Województwo Mazowieckie",
        objectId: "woj-mazowieckie",
        rowid: 1,
      });
      insertArea(database, {
        code: "1408",
        geometry: bigSquare,
        layerId: "A02",
        name: "Powiat Legionowski",
        objectId: "pow-legionowski",
        rowid: 2,
      });
      insertArea(database, {
        code: "1408032",
        geometry: square,
        layerId: "A03",
        name: "Gmina Wieliszew",
        objectId: "gmina-wieliszew",
        rowid: 3,
        sourceProperties: { jpt_kod_je: "1408032" },
      });
      insertArea(database, {
        code: "1408032",
        geometry: square,
        layerId: "A03",
        name: "Gmina Wieliszew 2025",
        objectId: "gmina-wieliszew",
        rowid: 4,
        snapshotId: 2,
      });
      insertArea(database, {
        geometry: diagonal,
        layerId: "W01",
        name: "Linia testowa",
        objectId: "linia-testowa",
        rowid: 5,
      });
      insertArea(database, { geometry: bigSquare, layerId: "S03", name: "Sąd Rejonowy w Legionowie", objectId: "sad", rowid: 6 });
      insertArea(database, { geometry: bigSquare, layerId: "P03", name: "Prokuratura Rejonowa w Legionowie", objectId: "prokuratura", rowid: 7 });
      insertArea(database, { geometry: bigSquare, layerId: "K02", name: "Komenda Powiatowa Policji w Legionowie", objectId: "policja", rowid: 8 });
      insertArea(database, { geometry: bigSquare, layerId: "U02", name: "Urząd Skarbowy w Legionowie", objectId: "urzad-skarbowy", rowid: 9 });
      insertArea(database, { geometry: bigSquare, layerId: "U06", name: "Nadleśnictwo Jabłonna", objectId: "nadlesnictwo", rowid: 10 });
      insertArea(database, { geometry: bigSquare, layerId: "W02", name: "Morze Terytorialne RP", objectId: "morze-terytorialne", rowid: 11 });
    } finally {
      database.close();
    }

    return {
      config: loadPrgConfig({ configDir: directory, dataDir: directory, logLevel: "silent", port: 0, transport: "stdio" }, {}),
      gminaAreaId: encodeAreaId({ layerId: "A03", objectId: "gmina-wieliszew", snapshotId: 1 }),
    };
  }
});

type AreaFixture = {
  readonly rowid: number;
  readonly snapshotId?: number;
  readonly layerId: string;
  readonly objectId: string;
  readonly name?: string;
  readonly code?: string;
  readonly geometry: PrgGeometry;
  readonly sourceProperties?: Record<string, unknown>;
};

function insertArea(database: Database.Database, fixture: AreaFixture): void {
  const bbox = bboxOfGeometry(fixture.geometry);
  const centroid = centroidOfGeometry(fixture.geometry);

  database
    .prepare(`
      insert into areas (
        rowid, snapshot_id, layer_id, object_id, name, normalized_name, aliases, code, iip_id, regon,
        valid_from, valid_to, version_from, version_to, area_m2, centroid_x, centroid_y,
        min_x, min_y, max_x, max_y, geometry_wkb, source_properties_json
      ) values (
        @rowid, @snapshotId, @layerId, @objectId, @name, @normalizedName, null, @code, null, null,
        '2020-01-01', null, null, null, null, @centroidX, @centroidY,
        @minX, @minY, @maxX, @maxY, @geometryWkb, @sourcePropertiesJson
      )
    `)
    .run({
      centroidX: centroid.coordinates[0],
      centroidY: centroid.coordinates[1],
      code: fixture.code ?? null,
      geometryWkb: Buffer.from(encodeWkb(fixture.geometry)),
      layerId: fixture.layerId,
      maxX: bbox.maxX,
      maxY: bbox.maxY,
      minX: bbox.minX,
      minY: bbox.minY,
      name: fixture.name ?? fixture.objectId,
      normalizedName: (fixture.name ?? fixture.objectId).toLowerCase(),
      objectId: fixture.objectId,
      rowid: fixture.rowid,
      snapshotId: fixture.snapshotId ?? 1,
      sourcePropertiesJson: JSON.stringify(fixture.sourceProperties ?? {}),
    });

  database
    .prepare("insert into areas_rtree(rowid, min_x, max_x, min_y, max_y) values (@rowid, @minX, @maxX, @minY, @maxY)")
    .run({ maxX: bbox.maxX, maxY: bbox.maxY, minX: bbox.minX, minY: bbox.minY, rowid: fixture.rowid });
  database.prepare("insert into areas_fts(rowid, name, normalized_name, code, aliases) values (@rowid, @name, @normalizedName, @code, '')").run({
    code: fixture.code ?? "",
    name: fixture.name ?? fixture.objectId,
    normalizedName: (fixture.name ?? fixture.objectId).toLowerCase(),
    rowid: fixture.rowid,
  });
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

const bigSquare: PolygonGeometry = {
  coordinates: [[
    [-1, -1],
    [11, -1],
    [11, 11],
    [-1, 11],
    [-1, -1],
  ]],
  type: "Polygon",
};

const diagonal: LineStringGeometry = {
  coordinates: [
    [-1, -1],
    [11, 11],
  ],
  type: "LineString",
};
