import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { initializePrgDatabases } from "../../../src/features/persistence/index.js";
import { loadPrgConfig } from "../../../src/runtime/config.js";
import { createDataResultMetadata } from "../../../src/shared/data-result.js";

describe("data result coverage metadata", () => {
  it("requires every requested layer and scope pair before marking coverage complete", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "prg-data-result-"));
    const { catalogPath } = initializePrgDatabases({ addressShardCodes: ["14"], dataDir });
    const database = new Database(catalogPath);
    try {
      const snapshot = database.prepare(`
        insert into snapshots(dataset_key, scope, state_date, state_date_key, downloaded_at, checked_at, sha256, record_count, schema_fingerprint, adapter_version, source_url)
        values ('current:A00','country:PL',null,'','2026-06-25','2026-06-25','abc',1,'schema','1','https://example.test')
      `).run();
      database.prepare("insert into installed_coverage(layer_id,scope_type,scope_code,snapshot_id,completeness) values ('A00','country','PL',?,'complete')").run(snapshot.lastInsertRowid);
    } finally {
      database.close();
    }

    expect(createDataResultMetadata(loadPrgConfig({
      configDir: dataDir,
      dataDir,
      logLevel: "silent",
      port: 0,
      transport: "stdio",
    }, {}), {
      channels: ["wfs"],
      layerIds: ["A00", "A01"],
      requestedScopes: ["country:PL"],
    })).toMatchObject({
      coverage: {
        complete: false,
        installedScopes: ["country:PL"],
        missingScopes: ["A01:country:PL"],
      },
      datasetState: "installed",
    });
  });

  it("ignores incomplete installed coverage rows", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "prg-data-result-partial-"));
    const { catalogPath } = initializePrgDatabases({ addressShardCodes: ["14"], dataDir });
    const database = new Database(catalogPath);
    try {
      const snapshot = database.prepare(`
        insert into snapshots(dataset_key, scope, state_date, state_date_key, downloaded_at, checked_at, sha256, record_count, schema_fingerprint, adapter_version, source_url)
        values ('current:A00','country:PL',null,'','2026-06-25','2026-06-25','abc',1,'schema','1','https://example.test')
      `).run();
      database.prepare("insert into installed_coverage(layer_id,scope_type,scope_code,snapshot_id,completeness) values ('A00','country','PL',?,'partial')").run(snapshot.lastInsertRowid);
    } finally {
      database.close();
    }

    expect(createDataResultMetadata(loadPrgConfig({
      configDir: dataDir,
      dataDir,
      logLevel: "silent",
      port: 0,
      transport: "stdio",
    }, {}), {
      channels: ["wfs"],
      layerIds: ["A00"],
      requestedScopes: ["country:PL"],
    })).toMatchObject({
      coverage: {
        complete: false,
        installedScopes: [],
        missingScopes: ["country:PL"],
      },
      datasetState: "not_installed",
    });
  });

  it("uses layer-specific fallback coverage instead of marking every layer installed", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "prg-data-result-fallback-"));

    expect(createDataResultMetadata(loadPrgConfig({
      configDir: dataDir,
      dataDir,
      logLevel: "silent",
      port: 0,
      transport: "stdio",
    }, {}), {
      channels: ["wfs"],
      fallbackCoverage: [{ layerId: "A00", scope: "country:PL" }],
      layerIds: ["A00", "A01"],
      requestedScopes: ["country:PL"],
    })).toMatchObject({
      coverage: {
        complete: false,
        installedScopes: ["country:PL"],
        missingScopes: ["A01:country:PL"],
      },
    });
  });

  it("filters installed coverage by dataset key and archive year", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "prg-data-result-dataset-"));
    const { catalogPath } = initializePrgDatabases({ addressShardCodes: ["14"], dataDir });
    const database = new Database(catalogPath);
    try {
      const archive = database.prepare(`
        insert into snapshots(dataset_key, scope, state_date, state_date_key, downloaded_at, checked_at, sha256, record_count, schema_fingerprint, adapter_version, source_url, archive_year)
        values ('archive:2024:A00','country:PL','2024-01-01','2024-01-01','2026-06-25','2026-06-25','archive',1,'schema','1','https://example.test',2024)
      `).run();
      database.prepare(`
        insert into installed_coverage(layer_id,dataset_key,archive_year,scope_type,scope_code,snapshot_id,completeness)
        values ('A00','archive:2024:A00',2024,'country','PL',?,'complete')
      `).run(archive.lastInsertRowid);
    } finally {
      database.close();
    }

    const config = loadPrgConfig({
      configDir: dataDir,
      dataDir,
      logLevel: "silent",
      port: 0,
      transport: "stdio",
    }, {});

    expect(createDataResultMetadata(config, {
      archiveYear: 0,
      channels: ["wfs"],
      datasetKeys: ["current:A00"],
      layerIds: ["A00"],
      requestedScopes: ["country:PL"],
    })).toMatchObject({
      coverage: {
        complete: false,
        installedScopes: [],
        missingScopes: ["country:PL"],
      },
      datasetState: "not_installed",
    });

    expect(createDataResultMetadata(config, {
      archiveYear: 2024,
      channels: ["wfs"],
      datasetKeys: ["archive:2024:A00"],
      layerIds: ["A00"],
      requestedScopes: ["country:PL"],
    })).toMatchObject({
      coverage: {
        complete: true,
        installedScopes: ["country:PL"],
        missingScopes: [],
      },
      datasetState: "installed",
    });
  });
});
