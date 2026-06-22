import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  checkWfsCapabilitiesCanary,
  parseWfsCapabilities,
  prgWfsDefaultCrs,
  type PrgLayer,
} from "../../../src/features/source-catalog/index.js";

const fixtureUrl = new URL("./fixtures/wfs-capabilities-minimal.xml", import.meta.url);

const expectedCatalogSubset: readonly PrgLayer[] = [
  {
    layerId: "A00",
    sourceName: "A00_Granice_panstwa",
    titlePl: "Granice państwa",
    category: "administrative",
    geometryType: "polygon",
    sourceChannel: "wfs",
  },
  {
    layerId: "W01",
    sourceName: "W01_Linia_podstawowa_morza_terytorialnego",
    titlePl: "Linia podstawowa morza terytorialnego",
    category: "maritime",
    geometryType: "line",
    sourceChannel: "wfs",
  },
];

describe("WFS capabilities canary", () => {
  it("parses FeatureType metadata needed by the source canary", async () => {
    const capabilities = parseWfsCapabilities(await readFile(fixtureUrl, "utf8"));

    expect(capabilities.featureTypes).toEqual([
      {
        name: "ms:A00_Granice_panstwa",
        title: "A00_Granice_panstwa",
        defaultCrs: prgWfsDefaultCrs,
        otherCrs: ["urn:ogc:def:crs:EPSG::4326"],
        outputFormats: ["application/gml+xml; version=3.2"],
      },
      {
        name: "ms:W01_Linia_podstawowa_morza_terytorialnego",
        title: "W01_Linia_podstawowa_morza_terytorialnego",
        defaultCrs: prgWfsDefaultCrs,
        otherCrs: [],
        outputFormats: ["application/gml+xml; version=3.2"],
      },
    ]);
  });

  it("passes when the WFS source has the expected catalog layers", async () => {
    const capabilities = parseWfsCapabilities(await readFile(fixtureUrl, "utf8"));

    expect(checkWfsCapabilitiesCanary(capabilities, expectedCatalogSubset)).toEqual({
      ok: true,
      added: [],
      removed: [],
      changed: [],
    });
  });

  it("detects added, removed and changed WFS layers", () => {
    const report = checkWfsCapabilitiesCanary(
      {
        featureTypes: [
          {
            name: "ms:A00_Granice_panstwa",
            title: "A00 boundary renamed",
            defaultCrs: "urn:ogc:def:crs:EPSG::4326",
            otherCrs: [],
            outputFormats: [],
          },
          {
            name: "ms:Unexpected",
            title: "Unexpected",
            defaultCrs: prgWfsDefaultCrs,
            otherCrs: [],
            outputFormats: [],
          },
        ],
      },
      expectedCatalogSubset,
    );

    expect(report).toEqual({
      ok: false,
      added: ["Unexpected"],
      removed: ["W01_Linia_podstawowa_morza_terytorialnego"],
      changed: [
        {
          layerId: "A00",
          sourceName: "A00_Granice_panstwa",
          issues: [
            {
              kind: "title",
              expected: "A00_Granice_panstwa",
              actual: "A00 boundary renamed",
            },
            {
              kind: "defaultCrs",
              expected: prgWfsDefaultCrs,
              actual: "urn:ogc:def:crs:EPSG::4326",
            },
          ],
        },
      ],
    });
  });
});
