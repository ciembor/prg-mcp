import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  initializePrgDatabases,
  prgCanonicalMappingVersion,
  prgDatabaseSchemaVersion,
  readPrgDatabaseSchemaState,
  type InitializedPrgDatabases,
  type InitializePrgDatabaseOptions,
  type PrgDatabaseSchemaState,
  type PrgVoivodeshipCode,
} from "../../../src/features/persistence/index.js";

describe("PRG SQLite schema migrations", () => {
  it("keeps exported persistence types intentional", () => {
    expectTypeOf<InitializePrgDatabaseOptions>().toHaveProperty("dataDir").toEqualTypeOf<string>();
    expectTypeOf<InitializedPrgDatabases>().toHaveProperty("addressShardPaths").toEqualTypeOf<
      Readonly<Record<PrgVoivodeshipCode, string>>
    >();
    expectTypeOf<PrgDatabaseSchemaState>().toHaveProperty("canonicalMappingVersion").toEqualTypeOf<string>();
  });

  it("creates catalog, boundaries and selected address shard databases idempotently", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "prg-mcp-db-"));
    const initialized = initializePrgDatabases({
      dataDir,
      addressShardCodes: ["02", "14"],
      appVersion: "test",
    });
    const initializedAgain = initializePrgDatabases({
      dataDir,
      addressShardCodes: ["02", "14"],
      appVersion: "test",
    });

    expect(initializedAgain).toEqual(initialized);
    expect(readPrgDatabaseSchemaState(initialized.catalogPath)).toEqual({
      kind: "catalog",
      version: prgDatabaseSchemaVersion,
      canonicalMappingVersion: prgCanonicalMappingVersion,
    });
    expect(readPrgDatabaseSchemaState(initialized.boundariesPath)).toMatchObject({
      kind: "boundaries",
      version: prgDatabaseSchemaVersion,
    });
    expect(Object.keys(initialized.addressShardPaths).sort()).toEqual(["02", "14"]);
    expect(readPrgDatabaseSchemaState(initialized.addressShardPaths["02"])).toMatchObject({
      kind: "address-shard",
      version: prgDatabaseSchemaVersion,
    });
  });

  it("creates required catalog tables and indexes", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "prg-mcp-catalog-"));
    const { catalogPath } = initializePrgDatabases({ dataDir, addressShardCodes: ["02"] });

    withDatabase(catalogPath, (database) => {
      expect(sqliteObjects(database)).toEqual(
        expect.arrayContaining(["installed_coverage", "layers", "schema_metadata", "snapshots", "sync_runs"]),
      );
      expect(database.pragma("user_version", { simple: true })).toBe(prgDatabaseSchemaVersion);
      expect((database.prepare("select created_at as createdAt from schema_metadata limit 1").get() as { createdAt: string }).createdAt).not.toBe(
        "1970-01-01T00:00:00.000Z",
      );
    });
  });

  it("migrates nullable snapshot dates and coverage to stable unique keys", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "prg-mcp-catalog-migration-"));
    const catalogPath = join(dataDir, "catalog.sqlite");
    withDatabase(catalogPath, (database) => {
      database.exec(`
        create table schema_metadata (
          version integer not null,
          kind text not null,
          canonical_mapping_version text not null,
          created_at text not null,
          app_version text not null
        );
        insert into schema_metadata values (1, 'catalog', 'old', '1970-01-01T00:00:00.000Z', 'test');
        create table snapshots (
          id integer primary key,
          dataset_key text not null,
          scope text not null,
          state_date text,
          downloaded_at text not null,
          checked_at text not null,
          etag text,
          last_modified text,
          sha256 text,
          record_count integer,
          schema_fingerprint text not null,
          adapter_version text not null,
          source_url text not null,
          archive_year integer,
          unique (dataset_key, scope, state_date)
        );
        create table installed_coverage (
          layer_id text not null,
          scope_type text not null,
          scope_code text not null,
          snapshot_id integer not null references snapshots(id),
          completeness text not null,
          primary key (layer_id, scope_type, scope_code, snapshot_id)
        );
      `);
      database.prepare(`
        insert into snapshots(id, dataset_key, scope, state_date, downloaded_at, checked_at, sha256, record_count, schema_fingerprint, adapter_version, source_url)
        values
          (1, 'current:A00', 'country:PL', null, '2026-06-23', '2026-06-23', 'old', 1, 'schema', 'adapter', 'https://example.test/old'),
          (2, 'current:A00', 'country:PL', null, '2026-06-24', '2026-06-24', 'new', 2, 'schema', 'adapter', 'https://example.test/new')
      `).run();
      database.prepare(`
        insert into installed_coverage(layer_id, scope_type, scope_code, snapshot_id, completeness)
        values ('A00', 'country', 'PL', 1, 'complete'), ('A00', 'country', 'PL', 2, 'complete')
      `).run();
    });

    initializePrgDatabases({ dataDir, addressShardCodes: ["02"] });

    withDatabase(catalogPath, (database) => {
      expect(database.prepare("select id, state_date_key from snapshots").all()).toEqual([{ id: 2, state_date_key: "" }]);
      expect(database.prepare("select layer_id, scope_type, scope_code, snapshot_id from installed_coverage").all()).toEqual([
        { layer_id: "A00", scope_code: "PL", scope_type: "country", snapshot_id: 2 },
      ]);
      expect(sqliteObjects(database)).toContain("snapshots_dataset_state_date_key_idx");
    });
  });

  it("creates boundaries FTS5 and R-tree structures", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "prg-mcp-boundaries-"));
    const { boundariesPath } = initializePrgDatabases({ dataDir, addressShardCodes: ["02"] });

    withDatabase(boundariesPath, (database) => {
      expect(sqliteObjects(database)).toEqual(expect.arrayContaining(["areas", "areas_fts", "areas_rtree"]));
      expect(database.prepare("select count(*) as count from areas_fts").get()).toEqual({ count: 0 });
      expect(database.prepare("select count(*) as count from areas_rtree").get()).toEqual({ count: 0 });
    });
  });

  it("creates address shard FTS5, R-tree and import batch structures", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "prg-mcp-addresses-"));
    const { addressShardPaths } = initializePrgDatabases({ dataDir, addressShardCodes: ["14"] });

    withDatabase(addressShardPaths["14"], (database) => {
      expect(sqliteObjects(database)).toEqual(
        expect.arrayContaining([
          "addresses",
          "addresses_fts",
          "addresses_rtree",
          "import_batches",
          "streets",
          "streets_fts",
          "streets_rtree",
        ]),
      );
    });
  });
});

function withDatabase(path: string, callback: (database: Database.Database) => void): void {
  const database = new Database(path);

  try {
    callback(database);
  } finally {
    database.close();
  }
}

function sqliteObjects(database: Database.Database): readonly string[] {
  return (
    database
      .prepare("select name from sqlite_master where type in ('table', 'index') order by name")
      .all() as { name: string }[]
  ).map((row) => row.name);
}
