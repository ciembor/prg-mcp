import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import { afterEach, describe, expect, expectTypeOf, it } from "vitest";

import { initializePrgDatabases } from "../../../src/features/persistence/index.js";
import {
  classifyTextMatch,
  compareTextMatches,
  defaultTextMatchThresholds,
  insertAddressSearchDocument,
  normalizePolishSearchText,
  rebuildStreetSearchIndex,
  searchAddresses,
  searchStreets,
  toPolishFtsQuery,
  type AddressSearchDocument,
  type AddressSearchOptions,
  type AddressSearchResult,
  type StreetSearchResult,
  type TextMatch,
  type TextMatchMode,
  type TextMatchThresholds,
} from "../../../src/features/search/index.js";

describe("address and street search", () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(temporaryDirectories.map((directory) => rm(directory, { force: true, recursive: true })));
    temporaryDirectories.length = 0;
  });

  it("normalizes Polish street text, abbreviations and building numbers", () => {
    expect(normalizePolishSearchText(" Ul. Żurawia 12 A ")).toBe("ulica zurawia 12a");
    expect(normalizePolishSearchText("al. Jana Pawła II 12 / 14")).toBe("aleja jana pawla ii 12/14");
    expect(normalizePolishSearchText("pl. Grzybowski")).toBe("plac grzybowski");
    expect(normalizePolishSearchText("00-503")).toBe("00503");
    expect(toPolishFtsQuery("ul. Żurawia 6/12")).toBe("\"ulica\"* \"zurawia\"* \"6\"* \"12\"*");
    expect(toPolishFtsQuery("Warszawa 00-503")).toBe("\"warszawa\"* \"00503\"*");
  });

  it("classifies exact, prefix, contains and fuzzy matches with separate thresholds", () => {
    expect(classifyTextMatch("ulica zurawia", "ul. Żurawia").mode).toBe("exact");
    expect(classifyTextMatch("zur", "Żurawia").mode).toBe("prefix");
    expect(classifyTextMatch("raw", "Żurawia").mode).toBe("contains");
    expect(classifyTextMatch("zurawya", "Żurawia").mode).toBe("fuzzy");
    expect(classifyTextMatch("zurawya", "Żurawia", {
      ...defaultTextMatchThresholds,
      fuzzyMaxDistance: 0,
    }).mode).toBe("none");
    expect(compareTextMatches(classifyTextMatch("zur", "Żurawia"), classifyTextMatch("raw", "Żurawia"))).toBeLessThan(0);
    expectTypeOf<TextMatchMode>().toMatchTypeOf<string>();
    expectTypeOf<TextMatchThresholds>().toMatchTypeOf<typeof defaultTextMatchThresholds>();
    expectTypeOf<TextMatch>().toMatchTypeOf<{
      mode: TextMatchMode;
    }>();
  });

  it("searches address FTS documents and ranks exact full-address matches", async () => {
    const database = await createAddressDatabase();
    insertAddress(database);
    insertAddressSearchDocument(database, {
      buildingNumber: "6/12",
      fullAddress: "Warszawa ul. Żurawia 6/12 00503",
      localityName: "Warszawa",
      postalCode: "00503",
      rowid: 1,
      streetName: "Żurawia",
    });

    const results = searchAddresses(database, {
      query: "Warszawa ulica Żurawia 6/12 00-503",
      limit: 5,
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      buildingNumber: "6/12",
      objectId: "pa-1",
      match: {
        mode: "exact",
      },
    });
    expectTypeOf<AddressSearchDocument>().toMatchTypeOf<{
      rowid: number;
    }>();
    expectTypeOf<AddressSearchOptions>().toMatchTypeOf<{
      query: string;
    }>();
    expectTypeOf<AddressSearchResult>().toEqualTypeOf<(typeof results)[number]>();
    database.close();
  });

  it("searches street FTS and normalizes street abbreviations", async () => {
    const database = await createAddressDatabase();
    insertStreet(database);
    insertStreetWithoutKind(database);
    rebuildStreetSearchIndex(database);

    const results = searchStreets(database, {
      query: "ul. Żurawia",
      limit: 5,
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      name: "Żurawia",
      objectId: "ul-1",
      match: {
        mode: "exact",
      },
    });
    expect(searchStreets(database, { query: "ul. Bracka", limit: 5 })).toMatchObject([
      {
        name: "Bracka",
        objectId: "ul-2",
        match: {
          mode: "exact",
        },
      },
    ]);
    expectTypeOf<StreetSearchResult>().toEqualTypeOf<(typeof results)[number]>();
    database.close();
  });

  async function createAddressDatabase(): Promise<Database.Database> {
    const directory = await mkdtemp(join(tmpdir(), "prg-address-search-"));
    temporaryDirectories.push(directory);
    const { addressShardPaths } = initializePrgDatabases({
      addressShardCodes: ["14"],
      dataDir: directory,
    });

    return new Database(addressShardPaths["14"]);
  }
});

function insertAddress(database: Database.Database): void {
  database
    .prepare(`
      insert into addresses (
        rowid,
        object_id,
        locality_name,
        street_name,
        building_number,
        postal_code,
        x,
        y,
        source_scope
      ) values (
        1,
        'pa-1',
        'Warszawa',
        'Żurawia',
        '6/12',
        '00503',
        637807,
        486708,
        'mazowieckie'
      )
    `)
    .run();
}

function insertStreet(database: Database.Database): void {
  database
    .prepare(`
      insert into streets (
        rowid,
        object_id,
        name,
        normalized_name,
        min_x,
        min_y,
        max_x,
        max_y,
        geometry_wkb
      ) values (
        1,
        'ul-1',
        'Żurawia',
        'ulica zurawia',
        0,
        0,
        1,
        1,
        x'00'
      )
    `)
    .run();
}

function insertStreetWithoutKind(database: Database.Database): void {
  database
    .prepare(`
      insert into streets (
        rowid,
        object_id,
        name,
        normalized_name,
        min_x,
        min_y,
        max_x,
        max_y,
        geometry_wkb
      ) values (
        2,
        'ul-2',
        'Bracka',
        'bracka',
        0,
        0,
        1,
        1,
        x'00'
      )
    `)
    .run();
}
