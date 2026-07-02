import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { callTool } from "@mcp-craftsman/core";
import type { RuntimeConfig } from "@mcp-craftsman/node";

import { createApp } from "../../src/app.js";
import { initializePrgDatabases } from "../../src/features/persistence/index.js";
import { loadPrgConfig } from "../../src/runtime/config.js";

describe("operational MCP tools", () => {
  it("reports package and local server state without creating datasets", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "prg-operations-"));
    const app = createApp(testConfig(dataDir));
    const about = await callTool(app, "about", {});
    const server = await callTool(app, "server_status", {});
    expect(about.structuredContent).toMatchObject({ name: "prg-mcp", databaseSchemaVersion: 3 });
    expect(server.structuredContent).toMatchObject({ dataDir, sqlite: { fts5: true, rtree: true }, totalSizeBytes: 0 });
    expect(server.structuredContent).toMatchObject({
      databases: expect.arrayContaining([
        expect.objectContaining({ exists: false, name: "catalog.sqlite" }),
      ]),
    });
  });

  it("returns a 54-layer catalog and an installed coverage matrix", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "prg-coverage-"));
    const { catalogPath } = initializePrgDatabases({ addressShardCodes: ["14"], dataDir });
    const database = new Database(catalogPath);
    try {
      const snapshot = database.prepare(`
        insert into snapshots(dataset_key, scope, state_date, downloaded_at, checked_at, sha256, record_count, schema_fingerprint, adapter_version, source_url)
        values ('current:A00','country:PL','2026-06-22','2026-06-23','2026-06-23','abc',1,'schema','1','https://example.test')
      `).run();
      database.prepare(`
        insert into installed_coverage(layer_id,dataset_key,archive_year,scope_type,scope_code,snapshot_id,completeness)
        values ('A00','current:A00',0,'country','PL',?,'complete')
      `).run(snapshot.lastInsertRowid);
    } finally { database.close(); }
    const app = createApp(testConfig(dataDir));
    const layers = (await callTool(app, "list_layers", {})).structuredContent as { layers: Array<{ layerId: string; available: boolean; usage: string }> };
    const status = (await callTool(app, "source_status", {})).structuredContent;
    const server = (await callTool(app, "server_status", {})).structuredContent;
    expect(layers.layers).toHaveLength(54);
    expect(layers.layers.find((layer) => layer.layerId === "A00")).toMatchObject({ available: true });
    expect(layers.layers.every((layer) => layer.usage.length > 10)).toBe(true);
    expect(status).toMatchObject({
      installedLayerCount: 1,
      totalLayerCount: 54,
      coverage: [{ datasetKey: "current:A00", layerId: "A00", scopeCode: "PL" }],
      sources: [{ datasetKey: "current:A00" }],
    });
    expect(server).toMatchObject({
      databases: expect.arrayContaining([
        expect.objectContaining({ canonicalMappingVersion: "2026-06-22", name: "catalog.sqlite", schemaStatus: "current", schemaVersion: 3 }),
      ]),
    });
  });

  it("does not mark partial installed coverage as available", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "prg-partial-coverage-"));
    const { catalogPath } = initializePrgDatabases({ addressShardCodes: ["14"], dataDir });
    const database = new Database(catalogPath);
    try {
      const snapshot = database.prepare(`
        insert into snapshots(dataset_key, scope, state_date, state_date_key, downloaded_at, checked_at, sha256, record_count, schema_fingerprint, adapter_version, source_url)
        values ('current:A00','country:PL',null,'','2026-06-23','2026-06-23','abc',1,'schema','1','https://example.test')
      `).run();
      database.prepare(`
        insert into installed_coverage(layer_id,dataset_key,archive_year,scope_type,scope_code,snapshot_id,completeness)
        values ('A00','current:A00',0,'country','PL',?,'partial')
      `).run(snapshot.lastInsertRowid);
    } finally { database.close(); }

    const app = createApp(testConfig(dataDir));
    const layers = (await callTool(app, "list_layers", {})).structuredContent as { layers: Array<{ layerId: string; available: boolean }> };
    const status = (await callTool(app, "source_status", {})).structuredContent;
    expect(layers.layers.find((layer) => layer.layerId === "A00")).toMatchObject({ available: false });
    expect(status).toMatchObject({ installedLayerCount: 0, sources: [] });
  });

  it("counts only current installed boundary snapshots in list_layers", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "prg-current-counts-"));
    const { boundariesPath, catalogPath } = initializePrgDatabases({ addressShardCodes: ["14"], dataDir });
    const catalog = new Database(catalogPath);
    try {
      catalog.prepare(`
        insert into snapshots(id, dataset_key, scope, state_date, state_date_key, downloaded_at, checked_at, sha256, record_count, schema_fingerprint, adapter_version, source_url)
        values (1, 'current:A03', 'country:PL', null, '', '2026-06-23', '2026-06-23', 'current', 1, 'schema', '1', 'https://example.test')
      `).run();
      catalog.prepare(`
        insert into snapshots(id, dataset_key, scope, state_date, state_date_key, downloaded_at, checked_at, sha256, record_count, schema_fingerprint, adapter_version, source_url, archive_year)
        values (2, 'archive:2024:A03', 'country:PL', '2024-01-01', '2024-01-01', '2026-06-24', '2026-06-24', 'archive', 2, 'schema', '1', 'https://example.test', 2024)
      `).run();
      catalog.prepare(`
        insert into installed_coverage(layer_id,dataset_key,archive_year,scope_type,scope_code,snapshot_id,completeness)
        values ('A03','current:A03',0,'country','PL',1,'complete'), ('A03','archive:2024:A03',2024,'country','PL',2,'complete')
      `).run();
    } finally {
      catalog.close();
    }

    const boundaries = new Database(boundariesPath);
    try {
      boundaries.prepare(`
        insert into areas(rowid, snapshot_id, layer_id, object_id, name, normalized_name, min_x, min_y, max_x, max_y, geometry_wkb)
        values
          (1, 1, 'A03', 'current', 'Current', 'current', 0, 0, 1, 1, X'00'),
          (2, 2, 'A03', 'archive-1', 'Archive 1', 'archive 1', 0, 0, 1, 1, X'00'),
          (3, 2, 'A03', 'archive-2', 'Archive 2', 'archive 2', 0, 0, 1, 1, X'00')
      `).run();
    } finally {
      boundaries.close();
    }

    const app = createApp(testConfig(dataDir));
    const layers = (await callTool(app, "list_layers", {})).structuredContent as { layers: Array<{ layerId: string; recordCount: number }> };
    const status = (await callTool(app, "source_status", {})).structuredContent;
    expect(layers.layers.find((layer) => layer.layerId === "A03")).toMatchObject({ recordCount: 1 });
    expect(status).toMatchObject({ installedLayerCount: 1 });
  });

  it("does not expose sync_data until a real synchronization runner is wired", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "prg-sync-tool-"));
    await expect(callTool(createApp(testConfig(dataDir)), "sync_data", { profile: "administrative" })).rejects.toMatchObject({
      message: "Tool \"sync_data\" is not registered.",
    });
  });

  it("distinguishes every remote source metadata state without downloading data", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "prg-source-probe-"));
    const states = ["available", "changed", "unavailable", "schema_changed", "unknown"] as const;
    const app = createApp(testConfig(dataDir), {
      sourceStatusProbe: async () => states.map((status, index) => ({ datasetKey: `source-${index}`, status })),
    });
    const result = (await callTool(app, "source_status", { checkRemote: true })).structuredContent as {
      checkedRemote: boolean;
      remoteStatus: string;
      sources: Array<{ status: string }>;
    };
    expect(result.checkedRemote).toBe(true);
    expect(result.remoteStatus).toBe("checked");
    expect(result.sources.map(({ status }) => status)).toEqual(states);
  });

  it("reports local source status when a remote probe is not configured", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "prg-source-probe-missing-"));

    await expect(callTool(createApp(testConfig(dataDir)), "source_status", { checkRemote: true })).resolves.toMatchObject({
      structuredContent: {
        checkedRemote: false,
        remoteReason: "Remote source status probe is not configured in this build.",
        remoteStatus: "not_configured",
      },
    });
  });
});

function testConfig(dataDir: string) {
  const runtime: RuntimeConfig = { configDir: join(dataDir, "config"), dataDir, logLevel: "silent", port: 0, transport: "stdio" };
  return loadPrgConfig(runtime, {});
}
