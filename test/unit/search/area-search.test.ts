import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import { afterEach, describe, expect, expectTypeOf, it } from "vitest";

import { initializePrgDatabases } from "../../../src/features/persistence/index.js";
import {
  normalizeAreaSearchText,
  rebuildAreaSearchIndex,
  searchAreaNames,
  toAreaFtsQuery,
  type AreaSearchOptions,
  type AreaSearchRank,
  type AreaSearchRankBucket,
  type AreaSearchResult,
} from "../../../src/features/search/index.js";

describe("area FTS search", () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(temporaryDirectories.map((directory) => rm(directory, { force: true, recursive: true })));
    temporaryDirectories.length = 0;
  });

  it("ranks exact area names before prefixes and FTS-only matches", async () => {
    const database = await createBoundariesDatabase();
    insertArea(database, {
      objectId: "exact",
      name: "Wieliszew",
      normalizedName: "wieliszew",
    });
    insertArea(database, {
      objectId: "prefix",
      name: "Wieliszew Pierwszy",
      normalizedName: "wieliszew pierwszy",
    });
    insertArea(database, {
      objectId: "alias",
      name: "Legionowo",
      normalizedName: "legionowo",
      aliases: "wieliszew historyczny",
    });
    rebuildAreaSearchIndex(database);

    const results = searchAreaNames(database, {
      query: "Wieliszew",
      limit: 10,
    });

    expect(results.map((result) => [result.objectId, result.rank.bucket])).toEqual([
      ["exact", "name-exact"],
      ["prefix", "name-prefix"],
      ["alias", "fts"],
    ]);
    expectTypeOf<AreaSearchResult>().toEqualTypeOf<(typeof results)[number]>();
    database.close();
  });

  it("uses deterministic tie-breaks when FTS rank is equal", async () => {
    const database = await createBoundariesDatabase();
    insertArea(database, {
      objectId: "tie-b",
      name: "Nowa Wieś",
      normalizedName: "nowa wies",
      rowid: 10,
    });
    insertArea(database, {
      objectId: "tie-a",
      name: "Nowa Wieś",
      normalizedName: "nowa wies",
      rowid: 11,
    });
    rebuildAreaSearchIndex(database);

    const results = searchAreaNames(database, {
      query: "Nowa",
      limit: 10,
    });

    expect(results.map((result) => result.objectId)).toEqual(["tie-a", "tie-b"]);
    database.close();
  });

  it("filters by snapshot and supports code-exact matches", async () => {
    const database = await createBoundariesDatabase();
    insertArea(database, {
      code: "1408032",
      objectId: "old",
      rowid: 20,
      snapshotId: 1,
    });
    insertArea(database, {
      code: "1408032",
      objectId: "current",
      rowid: 21,
      snapshotId: 2,
    });
    rebuildAreaSearchIndex(database);

    const results = searchAreaNames(database, {
      query: "1408032",
      snapshotId: 2,
    });

    expect(results.map((result) => [result.objectId, result.rank.bucket])).toEqual([["current", "code-exact"]]);
    database.close();
  });

  it("applies layer, code, and validity filters before limiting FTS matches", async () => {
    const database = await createBoundariesDatabase();
    for (let index = 0; index < 25; index += 1) {
      insertArea(database, {
        code: `WRONG-${index}`,
        layerId: "A03",
        name: "Wieliszew",
        objectId: `wrong-${index}`,
        rowid: 100 + index,
      });
    }
    insertArea(database, {
      code: "1408032",
      layerId: "A01",
      name: "Wieliszew",
      objectId: "wanted",
      rowid: 200,
      validFrom: "2026-01-01",
      validTo: "2026-12-31",
    });
    rebuildAreaSearchIndex(database);

    const results = searchAreaNames(database, {
      code: "1408032",
      layerId: "A01",
      limit: 1,
      query: "Wieliszew",
      validOn: "2026-06-25",
    });

    expect(results.map((result) => result.objectId)).toEqual(["wanted"]);
    database.close();
  });

  it("normalizes and escapes FTS input", () => {
    expect(normalizeAreaSearchText("  Łódź-Górna  ")).toBe("łodz gorna");
    expect(toAreaFtsQuery("Łódź \"Górna\"")).toBe("\"łodz\"* \"gorna\"*");
    expect(searchAreaNames(new Database(":memory:"), { query: "   " })).toEqual([]);
    expectTypeOf<AreaSearchOptions>().toMatchTypeOf<{
      query: string;
    }>();
    expectTypeOf<AreaSearchRank>().toMatchTypeOf<{
      bucket: AreaSearchRankBucket;
    }>();
  });

  async function createBoundariesDatabase(): Promise<Database.Database> {
    const directory = await mkdtemp(join(tmpdir(), "prg-area-search-"));
    temporaryDirectories.push(directory);
    const { boundariesPath } = initializePrgDatabases({
      addressShardCodes: ["02"],
      dataDir: directory,
    });

    return new Database(boundariesPath);
  }
});

type AreaFixture = {
  rowid?: number;
  snapshotId?: number;
  layerId?: string;
  objectId: string;
  name?: string;
  normalizedName?: string;
  code?: string;
  aliases?: string;
  validFrom?: string;
  validTo?: string;
};

let nextRowid = 1;

function insertArea(database: Database.Database, fixture: AreaFixture): void {
  database
    .prepare(`
      insert into areas (
        rowid,
        snapshot_id,
        layer_id,
        object_id,
        name,
        normalized_name,
        aliases,
        code,
        valid_from,
        valid_to,
        min_x,
        min_y,
        max_x,
        max_y,
        geometry_wkb,
        source_properties_json
      ) values (
        @rowid,
        @snapshotId,
        @layerId,
        @objectId,
        @name,
        @normalizedName,
        @aliases,
        @code,
        @validFrom,
        @validTo,
        0,
        0,
        1,
        1,
        x'00',
        '{}'
      )
    `)
    .run({
      aliases: fixture.aliases ?? null,
      code: fixture.code ?? "1408032",
      layerId: fixture.layerId ?? "A03",
      name: fixture.name ?? "Wieliszew",
      normalizedName: fixture.normalizedName ?? normalizeAreaSearchText(fixture.name ?? "Wieliszew"),
      objectId: fixture.objectId,
      rowid: fixture.rowid ?? nextRowid++,
      snapshotId: fixture.snapshotId ?? 1,
      validFrom: fixture.validFrom ?? null,
      validTo: fixture.validTo ?? null,
    });
}
