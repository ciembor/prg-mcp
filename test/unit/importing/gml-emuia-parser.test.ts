import { readFile } from "node:fs/promises";

import { describe, expect, expectTypeOf, it } from "vitest";

import {
  GmlSecurityError,
  detectEmuiaSchemaVersion,
  mapEmuiaAddressPoint,
  mapEmuiaFeature,
  mapEmuiaStreet,
  parseGmlFeatureMembers,
  type EmuiaAddressPoint,
  type EmuiaFeature,
  type EmuiaStreet,
  type GmlFeature,
} from "../../../src/features/importing/index.js";

const oldFixtureUrl = new URL("../source-catalog/fixtures/emuia-2012-address.gml", import.meta.url);
const newFixtureUrl = new URL("../source-catalog/fixtures/emuia-2021-address.gml", import.meta.url);

describe("streaming GML parser and EMUiA adapters", () => {
  it("streams GML feature members from the EMUiA 2012 fixture", async () => {
    const features = await parseFixture(oldFixtureUrl, 31);

    expect(features.map((feature) => feature.typeName)).toEqual(["AD_PunktAdresowy", "AD_Ulica"]);
    expect(features[0]).toMatchObject({
      id: "old-pa-1",
      namespaceUri: "urn:gugik:emuia:2012",
    });
    expect(features[0]?.properties.lokalnyId).toEqual(["PA-OLD-1"]);
    expect(features[0]?.geometries).toEqual([
      {
        coordinateElement: "pos",
        coordinateText: "637807 486708",
        srsName: "urn:ogc:def:crs:EPSG::2180",
        type: "Point",
      },
    ]);
  });

  it("maps EMUiA 2012 address and street features to one canonical shape", async () => {
    const features = await parseFixture(oldFixtureUrl, 128);
    const mapped = features.map((feature) => mapEmuiaFeature(feature));

    expect(mapped[0]).toEqual({
      geometry: {
        coordinates: [637807, 486708],
        srsName: "urn:ogc:def:crs:EPSG::2180",
        type: "Point",
      },
      houseNumber: "6/12",
      kind: "address-point",
      lifecycleStart: "2025-01-01",
      localId: "PA-OLD-1",
      namespace: "PL.PRG.AD",
      objectId: "old-pa-1",
      postalCode: "00503",
      schemaVersion: "emuia-2012",
      sourceFeatureType: "AD_PunktAdresowy",
      validFrom: "2025-01-01",
      versionId: "2025-01-01",
    });
    expect(mapped[1]).toMatchObject({
      fullName: "Żurawia",
      kind: "street",
      localId: "UL-OLD-1",
      name: "Żurawia",
      objectId: "old-ul-1",
      schemaVersion: "emuia-2012",
      sourceFeatureType: "AD_Ulica",
      streetType: "ulica",
      ulicId: "26579",
    });
    expectTypeOf(mapped[0]).toEqualTypeOf<EmuiaAddressPoint | EmuiaStreet | undefined>();
    expectTypeOf(mapped).toEqualTypeOf<Array<EmuiaFeature | undefined>>();
    expect(mapEmuiaAddressPoint(features[0] as GmlFeature).localId).toBe("PA-OLD-1");
    expect(mapEmuiaStreet(features[1] as GmlFeature).localId).toBe("UL-OLD-1");
  });

  it("maps EMUiA 2021 address and street features to the same canonical shape", async () => {
    const features = await parseFixture(newFixtureUrl, 19);
    const mapped = features.map((feature) => mapEmuiaFeature(feature));

    expect(detectEmuiaSchemaVersion(features[0] as GmlFeature)).toBe("emuia-2021");
    expect(mapped[0]).toMatchObject({
      houseNumber: "6/12",
      kind: "address-point",
      lifecycleStart: "2025-11-12",
      localId: "PA-NEW-1",
      objectId: "new-pa-1",
      schemaVersion: "emuia-2021",
      validFrom: "2025-11-12",
    });
    expect(mapped[1]).toMatchObject({
      fullName: "ul. Żurawia",
      kind: "street",
      localId: "UL-NEW-1",
      name: "Żurawia",
      objectId: "new-ul-1",
      schemaVersion: "emuia-2021",
      sourceFeatureType: "AD_UlicaPlac",
      ulicId: "26579",
    });
  });

  it("rejects DTD and ENTITY markup before parsing external entities", async () => {
    const xxe = `<?xml version="1.0"?>
      <!DOCTYPE gml:FeatureCollection [
        <!ENTITY xxe SYSTEM "file:///etc/passwd">
      ]>
      <gml:FeatureCollection xmlns:gml="http://www.opengis.net/gml/3.2">&xxe;</gml:FeatureCollection>`;

    await expect(collect(parseGmlFeatureMembers([xxe.slice(0, 35), xxe.slice(35)]))).rejects.toThrow(GmlSecurityError);
  });
});

async function parseFixture(url: URL, chunkSize: number): Promise<GmlFeature[]> {
  const xml = await readFile(url, "utf8");

  return collect(parseGmlFeatureMembers(splitIntoChunks(xml, chunkSize)));
}

async function collect<T>(items: AsyncIterable<T>): Promise<T[]> {
  const collected: T[] = [];

  for await (const item of items) {
    collected.push(item);
  }

  return collected;
}

function splitIntoChunks(value: string, chunkSize: number): string[] {
  const chunks: string[] = [];

  for (let index = 0; index < value.length; index += chunkSize) {
    chunks.push(value.slice(index, index + chunkSize));
  }

  return chunks;
}
