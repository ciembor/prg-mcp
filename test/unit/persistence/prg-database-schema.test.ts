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
