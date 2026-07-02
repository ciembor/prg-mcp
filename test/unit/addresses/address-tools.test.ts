import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import {
  decodeAddressId,
  decodeStreetId,
  encodeAddressId,
  encodeStreetId,
  getAddress,
  getStreet,
  reverseAddress,
  searchAddresses,
  searchStreets,
} from "../../../src/features/addresses/index.js";
import { initializePrgDatabases } from "../../../src/features/persistence/index.js";
import { insertAddressSearchDocument, rebuildStreetSearchIndex } from "../../../src/features/search/index.js";
import { bboxOfGeometry, encodeWkb, type LineStringGeometry } from "../../../src/features/spatial/index.js";
import { loadPrgConfig, type PrgConfig } from "../../../src/runtime/config.js";

describe("P6 address tools", () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(temporaryDirectories.map((directory) => rm(directory, { force: true, recursive: true })));
    temporaryDirectories.length = 0;
  });

  it("searches addresses by natural language and structured mutually exclusive inputs", async () => {
    const { config, warszawaAddressId, zurawiaStreetId } = await createAddressFixture();

    await expect(searchAddresses(config, { query: "Warszawa ul. Żurawia 12A", voivodeshipCodes: ["14"] })).resolves.toMatchObject({
      addresses: [{ addressId: warszawaAddressId, buildingNumber: "12A", localityName: "Warszawa", streetName: "Żurawia" }],
    });
    await expect(searchAddresses(config, { query: "Warszawa Zurawia 12A", voivodeshipCodes: ["14"] })).resolves.toMatchObject({
      addresses: [{ addressId: warszawaAddressId, buildingNumber: "12A", localityName: "Warszawa", streetName: "Żurawia" }],
    });
    await expect(searchAddresses(config, { query: "Żurawia 12A Warszawa", voivodeshipCodes: ["14"] })).resolves.toMatchObject({
      addresses: [{ addressId: warszawaAddressId, buildingNumber: "12A", localityName: "Warszawa", streetName: "Żurawia" }],
    });
    await expect(searchAddresses(config, {
      structured: { buildingNumber: "12/14", localityName: "Wieliszew" },
      voivodeshipCodes: ["14"],
    })).resolves.toMatchObject({
      addresses: [{ buildingNumber: "12/14", localityName: "Wieliszew", streetName: null }],
    });
    await expect(searchAddresses(config, {
      structured: { buildingNumber: "12/14", localityName: "Wieliszew", streetName: "Żurawia" },
      voivodeshipCodes: ["14"],
    })).resolves.toMatchObject({ addresses: [] });
    await expect(searchAddresses(config, {
      structured: { buildingNumber: "12A", localityName: "Warszawa", streetName: "Zurawia" },
      voivodeshipCodes: ["14"],
    })).resolves.toMatchObject({
      addresses: [{ addressId: warszawaAddressId, buildingNumber: "12A", localityName: "Warszawa", streetName: "Żurawia" }],
    });
    await expect(searchAddresses(config, {
      structured: { streetId: zurawiaStreetId },
    })).resolves.toMatchObject({
      addresses: [{ buildingNumber: "12A", streetId: zurawiaStreetId, voivodeshipCode: "14" }],
    });
    await expect(searchAddresses(config, { structured: { streetId: "not-an-opaque-street-id" } })).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    await expect(searchAddresses(config, { structured: { streetId: zurawiaStreetId }, voivodeshipCodes: ["10"] })).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    await expect(searchAddresses(config, { structured: {}, voivodeshipCodes: ["14"] })).rejects.toThrow("structured input requires at least one field");
    await expect(searchAddresses(config, { structured: { localityName: "" }, voivodeshipCodes: ["14"] })).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    await expect(searchAddresses(config, {
      structured: { buildingNumber: "7", localityName: "Warszawa" },
      voivodeshipCodes: ["14"],
    })).resolves.toMatchObject({ addresses: [] });
    await expect(searchAddresses(config, { query: "Warszawa", structured: { localityName: "Warszawa" } })).rejects.toThrow("exactly one");
  });

  it("gets address identifiers, IIP, coordinates, postal code attribute and source provenance", async () => {
    const { config, warszawaAddressId, zurawiaStreetId } = await createAddressFixture();

    await expect(getAddress(config, warszawaAddressId)).resolves.toMatchObject({
      addressId: warszawaAddressId,
      iipId: "iip-pa-1",
      point: [637807, 486708],
      postalCode: "00503",
      postalCodeNote: "postal_code_is_prg_attribute_not_postal_service_validation",
      sourceProperties: { emuia_id: "warszawa-1" },
      sourceScope: "woj:14",
      streetId: zurawiaStreetId,
    });
    await expect(getStreet(config, (await getAddress(config, warszawaAddressId)).streetId ?? "")).resolves.toMatchObject({
      name: "Żurawia",
      streetId: zurawiaStreetId,
    });
    expect(decodeAddressId(warszawaAddressId)).toEqual({ objectId: "pa-waw-zurawia-12a", voivodeshipCode: "14" });
  });

  it("reverse-searches by expanding R-tree bbox, exact distance and hard limits", async () => {
    const { config } = await createAddressFixture();

    await expect(reverseAddress(config, { radiusMeters: 20, voivodeshipCodes: ["14"], x: 637807, y: 486708 })).resolves.toMatchObject({
      addresses: [{ buildingNumber: "12A", distanceMeters: 0 }],
    });
    await expect(reverseAddress(config, { maxCandidates: 1, radiusMeters: 20, voivodeshipCodes: ["14"], x: 637807, y: 486708 })).resolves.toMatchObject({
      addresses: [{ buildingNumber: "12A", distanceMeters: 0 }],
    });
    const database = new Database(join(config.dataDir, "addresses-14.sqlite"));
    try {
      database.prepare("delete from addresses_rtree").run();
    } finally {
      database.close();
    }
    await expect(reverseAddress(config, { radiusMeters: 20, voivodeshipCodes: ["14"], x: 637807, y: 486708 })).resolves.toMatchObject({
      addresses: [{ buildingNumber: "12A", distanceMeters: 0 }],
    });
    await expect(reverseAddress(config, { radiusMeters: 20, voivodeshipCodes: ["14"], x: 1, y: 1 })).resolves.toMatchObject({ addresses: [] });
    await expect(reverseAddress(config, { radiusMeters: 10_001, x: 1, y: 1 })).rejects.toMatchObject({ code: "RADIUS_LIMIT_EXCEEDED" });

    const lodz = new Database(join(config.dataDir, "addresses-10.sqlite"));
    const mazowieckie = new Database(join(config.dataDir, "addresses-14.sqlite"));
    try {
      insertAddress(lodz, {
        buildingNumber: "1",
        localityName: "Limitowo",
        municipalityCode: "1061011",
        objectId: "pa-limit-10",
        rowid: 50,
        streetName: null,
        x: 100,
        y: 100,
      });
      insertAddress(mazowieckie, {
        buildingNumber: "2",
        localityName: "Limitowo",
        municipalityCode: "1465011",
        objectId: "pa-limit-14",
        rowid: 50,
        streetName: null,
        x: 100,
        y: 100,
      });
    } finally {
      lodz.close();
      mazowieckie.close();
    }
    await expect(reverseAddress(config, { limit: 1, maxCandidates: 1, radiusMeters: 20, voivodeshipCodes: ["10", "14"], x: 100, y: 100 })).rejects.toMatchObject({
      code: "CANDIDATE_LIMIT_EXCEEDED",
    });
  });

  it("applies reverse candidate limits after exact circular distance filtering", async () => {
    const { config } = await createAddressFixture();
    const database = new Database(join(config.dataDir, "addresses-14.sqlite"));
    try {
      for (let index = 0; index < 5; index += 1) {
        insertAddress(database, {
          buildingNumber: String(index),
          localityName: "Narożnik",
          municipalityCode: "1465011",
          objectId: `pa-corner-${index}`,
          rowid: 100 + index,
          streetName: null,
          x: 10,
          y: 10 + index,
        });
      }
      insertAddress(database, {
        buildingNumber: "1",
        localityName: "Centrum",
        municipalityCode: "1465011",
        objectId: "pa-circle-center",
        rowid: 110,
        streetName: null,
        x: 0,
        y: 0,
      });
      insertAddress(database, {
        buildingNumber: "99",
        localityName: "Daleko",
        municipalityCode: "1465011",
        objectId: "aa-far-object-id",
        rowid: 111,
        streetName: null,
        x: 8,
        y: 0,
      });
    } finally {
      database.close();
    }

    await expect(reverseAddress(config, { limit: 1, maxCandidates: 2, radiusMeters: 10, voivodeshipCodes: ["14"], x: 0, y: 0 })).resolves.toMatchObject({
      addresses: [{ objectId: "pa-circle-center" }],
    });
  });

  it("reverse-searches through the base address table when an old shard lacks R-tree", async () => {
    const { config } = await createAddressFixture();
    const database = new Database(join(config.dataDir, "addresses-14.sqlite"));
    try {
      database.prepare("drop table addresses_rtree").run();
    } finally {
      database.close();
    }

    await expect(reverseAddress(config, { radiusMeters: 20, voivodeshipCodes: ["14"], x: 637807, y: 486708 })).resolves.toMatchObject({
      addresses: [{ buildingNumber: "12A", distanceMeters: 0 }],
    });
  });

  it("reverse-searches through the base address table when R-tree is incomplete", async () => {
    const { config } = await createAddressFixture();
    const database = new Database(join(config.dataDir, "addresses-14.sqlite"));
    try {
      database.prepare("delete from addresses_rtree where rowid = 1").run();
    } finally {
      database.close();
    }

    await expect(reverseAddress(config, { radiusMeters: 20, voivodeshipCodes: ["14"], x: 637807, y: 486708 })).resolves.toMatchObject({
      addresses: [{ buildingNumber: "12A", distanceMeters: 0 }],
    });
  });

  it("does not treat empty initialized address shards as installed data", async () => {
    const directory = await mkdtemp(join(tmpdir(), "prg-empty-address-shard-"));
    temporaryDirectories.push(directory);
    initializePrgDatabases({ addressShardCodes: ["14"], dataDir: directory });
    const config = loadPrgConfig({ configDir: directory, dataDir: directory, logLevel: "silent", port: 0, transport: "stdio" }, {});

    await expect(searchAddresses(config, { query: "Warszawa", voivodeshipCodes: ["14"] })).rejects.toMatchObject({
      code: "DATA_NOT_INSTALLED",
    });
    await expect(searchStreets(config, { query: "Żurawia", voivodeshipCodes: ["14"] })).rejects.toMatchObject({
      code: "DATA_NOT_INSTALLED",
    });
  });

  it("searches and gets streets even when no address points reference them", async () => {
    const { config, lonelyStreetId } = await createAddressFixture();

    await expect(searchStreets(config, { query: "Rondo Testowe", voivodeshipCodes: ["14"] })).resolves.toMatchObject({
      streets: [{ name: "Rondo Testowe", streetId: lonelyStreetId }],
    });
    await expect(getStreet(config, lonelyStreetId)).resolves.toMatchObject({
      geometry: { type: "LineString" },
      name: "Rondo Testowe",
      streetId: lonelyStreetId,
    });
    expect(decodeStreetId(lonelyStreetId)).toEqual({ objectId: "ul-rondo-testowe", voivodeshipCode: "14" });
  });

  it("ranks address and street text matches globally across selected voivodeships", async () => {
    const { config } = await createAddressFixture();
    const lodz = new Database(join(config.dataDir, "addresses-10.sqlite"));
    const mazowieckie = new Database(join(config.dataDir, "addresses-14.sqlite"));
    try {
      insertAddress(lodz, {
        buildingNumber: "Test",
        localityName: "Ranking",
        municipalityCode: "1061011",
        objectId: "pa-ranking-exact",
        rowid: 20,
        streetName: null,
        x: 1,
        y: 1,
      });
      insertAddress(mazowieckie, {
        buildingNumber: "1",
        localityName: "Ranking Test",
        municipalityCode: "1465011",
        objectId: "pa-ranking-prefix",
        rowid: 20,
        streetName: null,
        x: 2,
        y: 2,
      });
      insertStreet(lodz, { name: "Ranking Test", normalizedName: "ranking test", objectId: "ul-ranking-exact", rowid: 20 });
      insertStreet(mazowieckie, { name: "Ranking Testowa", normalizedName: "ranking testowa", objectId: "ul-ranking-prefix", rowid: 20 });
      rebuildStreetSearchIndex(lodz);
      rebuildStreetSearchIndex(mazowieckie);
    } finally {
      lodz.close();
      mazowieckie.close();
    }

    await expect(searchAddresses(config, { limit: 1, query: "Ranking Test", voivodeshipCodes: ["14", "10"] })).resolves.toMatchObject({
      addresses: [{ objectId: "pa-ranking-exact", voivodeshipCode: "10" }],
    });
    await expect(searchStreets(config, { limit: 1, query: "Ranking Test", voivodeshipCodes: ["14", "10"] })).resolves.toMatchObject({
      streets: [{ objectId: "ul-ranking-exact", voivodeshipCode: "10" }],
    });
  });

  it("covers golden address queries for diacritics, duplicate localities, street kinds and missing street names", async () => {
    const { config } = await createAddressFixture();

    await expect(searchAddresses(config, { query: "Lodz al Jana Pawla II 12/14", voivodeshipCodes: ["10"] })).resolves.toMatchObject({
      addresses: [{ buildingNumber: "12/14", localityName: "Łódź", streetName: "Aleja Jana Pawła II" }],
    });
    await expect(searchAddresses(config, { query: "Krakow plac Centralny 1", voivodeshipCodes: ["12"] })).resolves.toMatchObject({
      addresses: [{ localityName: "Kraków", streetName: "Plac Centralny" }],
    });
    await expect(searchAddresses(config, { structured: { buildingNumber: "7", localityName: "Nowa Wieś" }, voivodeshipCodes: ["14"] })).resolves.toMatchObject({
      addresses: [{ municipalityCode: "1408012" }, { municipalityCode: "1408032" }],
    });
  });

  async function createAddressFixture(): Promise<{ config: PrgConfig; warszawaAddressId: string; lonelyStreetId: string; zurawiaStreetId: string }> {
    const directory = await mkdtemp(join(tmpdir(), "prg-address-tools-"));
    temporaryDirectories.push(directory);
    const { addressShardPaths } = initializePrgDatabases({ addressShardCodes: ["10", "12", "14"], dataDir: directory });

    for (const voivodeshipCode of ["10", "12", "14"] as const) {
      const database = new Database(addressShardPaths[voivodeshipCode]);

      try {
        insertFixtures(database, voivodeshipCode);
      } finally {
        database.close();
      }
    }

    return {
      config: loadPrgConfig({ configDir: directory, dataDir: directory, logLevel: "silent", port: 0, transport: "stdio" }, {}),
      lonelyStreetId: encodeStreetId({ objectId: "ul-rondo-testowe", voivodeshipCode: "14" }),
      warszawaAddressId: encodeAddressId({ objectId: "pa-waw-zurawia-12a", voivodeshipCode: "14" }),
      zurawiaStreetId: encodeStreetId({ objectId: "ul-zurawia", voivodeshipCode: "14" }),
    };
  }
});

function insertFixtures(database: Database.Database, voivodeshipCode: "10" | "12" | "14"): void {
  if (voivodeshipCode === "10") {
    insertAddress(database, {
      buildingNumber: "12/14",
      localityName: "Łódź",
      municipalityCode: "1061011",
      objectId: "pa-lodz-jpii-12-14",
      postalCode: "90001",
      rowid: 1,
      streetName: "Aleja Jana Pawła II",
      x: 520000,
      y: 430000,
    });
    insertAddress(database, {
      buildingNumber: "99",
      localityName: "Łódź",
      municipalityCode: "1061011",
      objectId: "pa-lodz-duplicate-street-id",
      postalCode: "90001",
      rowid: 2,
      streetId: "ul-zurawia",
      streetName: "Żurawia",
      x: 520001,
      y: 430001,
    });
    return;
  }

  if (voivodeshipCode === "12") {
    insertAddress(database, {
      buildingNumber: "1",
      localityName: "Kraków",
      municipalityCode: "1261011",
      objectId: "pa-krakow-centralny-1",
      postalCode: "31000",
      rowid: 1,
      streetName: "Plac Centralny",
      x: 560000,
      y: 240000,
    });
    return;
  }

  insertAddress(database, {
    buildingNumber: "12A",
    iipId: "iip-pa-1",
    localityName: "Warszawa",
    municipalityCode: "1465011",
    objectId: "pa-waw-zurawia-12a",
    postalCode: "00503",
    rowid: 1,
    sourceProperties: { emuia_id: "warszawa-1" },
    streetName: "Żurawia",
    streetId: "ul-zurawia",
    x: 637807,
    y: 486708,
  });
  insertAddress(database, {
    buildingNumber: "12/14",
    localityName: "Wieliszew",
    municipalityCode: "1408032",
    objectId: "pa-wieliszew-12-14",
    rowid: 2,
    streetName: null,
    x: 640000,
    y: 500000,
  });
  insertAddress(database, {
    buildingNumber: "7",
    localityName: "Nowa Wieś",
    municipalityCode: "1408012",
    objectId: "pa-nowa-wies-a-7",
    rowid: 3,
    streetName: "Polna",
    x: 641000,
    y: 501000,
  });
  insertAddress(database, {
    buildingNumber: "7",
    localityName: "Nowa Wieś",
    municipalityCode: "1408032",
    objectId: "pa-nowa-wies-b-7",
    rowid: 4,
    streetName: "Polna",
    x: 642000,
    y: 502000,
  });
  insertStreet(database, { name: "Rondo Testowe", objectId: "ul-rondo-testowe", rowid: 1 });
  insertStreet(database, { name: "Żurawia", normalizedName: "zurawia", objectId: "ul-zurawia", rowid: 2 });
  rebuildStreetSearchIndex(database);
}

type AddressFixture = {
  readonly rowid: number;
  readonly objectId: string;
  readonly iipId?: string;
  readonly municipalityCode: string;
  readonly localityName: string;
  readonly streetName: string | null;
  readonly streetId?: string;
  readonly buildingNumber: string;
  readonly postalCode?: string;
  readonly x: number;
  readonly y: number;
  readonly sourceProperties?: Record<string, unknown>;
};

function insertAddress(database: Database.Database, fixture: AddressFixture): void {
  database
    .prepare(`
      insert into addresses (
        rowid, object_id, iip_id, municipality_code, locality_name, street_id, street_name, building_number,
        postal_code, x, y, source_scope, source_properties_json
      ) values (
        @rowid, @objectId, @iipId, @municipalityCode, @localityName, @streetId, @streetName, @buildingNumber,
        @postalCode, @x, @y, 'woj:14', @sourcePropertiesJson
      )
    `)
    .run({
      buildingNumber: fixture.buildingNumber,
      iipId: fixture.iipId ?? null,
      localityName: fixture.localityName,
      municipalityCode: fixture.municipalityCode,
      objectId: fixture.objectId,
      postalCode: fixture.postalCode ?? null,
      rowid: fixture.rowid,
      sourcePropertiesJson: JSON.stringify(fixture.sourceProperties ?? {}),
      streetId: fixture.streetId ?? null,
      streetName: fixture.streetName,
      x: fixture.x,
      y: fixture.y,
    });
  database
    .prepare("insert into addresses_rtree(rowid, min_x, max_x, min_y, max_y) values (@rowid, @x, @x, @y, @y)")
    .run({ rowid: fixture.rowid, x: fixture.x, y: fixture.y });
  insertAddressSearchDocument(database, {
    buildingNumber: fixture.buildingNumber,
    fullAddress: [fixture.localityName, "ulica aleja plac", fixture.streetName, fixture.buildingNumber, fixture.postalCode].filter(Boolean).join(" "),
    localityName: fixture.localityName,
    postalCode: fixture.postalCode,
    rowid: fixture.rowid,
    streetName: fixture.streetName ?? undefined,
  });
}

function insertStreet(database: Database.Database, fixture: { readonly rowid: number; readonly objectId: string; readonly name: string; readonly normalizedName?: string }): void {
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
        @rowid, @objectId, @name, @normalizedName, @minX, @minY, @maxX, @maxY, @geometryWkb
      )
    `)
    .run({
      geometryWkb: Buffer.from(encodeWkb(geometry)),
      maxX: bbox.maxX,
      maxY: bbox.maxY,
      minX: bbox.minX,
      minY: bbox.minY,
      name: fixture.name,
      normalizedName: fixture.normalizedName ?? "rondo testowe",
      objectId: fixture.objectId,
      rowid: fixture.rowid,
    });
}
