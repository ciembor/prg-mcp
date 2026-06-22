import { describe, expect, it } from "vitest";

import {
  getPrgLayer,
  listPrgLayerDefinitions,
  prgLayerCatalog,
  prgLayerCatalogVersion,
} from "../../../src/features/source-catalog/index.js";

const expectedLayerIds = [
  "A00",
  "A01",
  "A02",
  "A03",
  "A04",
  "A05",
  "A06",
  "A07",
  "A08",
  "R01",
  "R02",
  "S01",
  "S02",
  "S03",
  "S04",
  "P01",
  "P02",
  "P03",
  "K01",
  "K02",
  "K03",
  "K04",
  "K05",
  "K06",
  "K07",
  "K08",
  "K09",
  "K10",
  "K11",
  "K12",
  "K13",
  "U01",
  "U02",
  "U03",
  "U04",
  "U05",
  "U06",
  "U07",
  "U08",
  "U09",
  "U10",
  "U11",
  "W01",
  "W02",
  "W03",
  "W04",
  "W05",
  "W06",
  "W07",
  "W08",
  "W09",
  "W10",
  "W11",
  "W12",
] as const;

describe("PRG layer catalog", () => {
  it("defines the complete static PRG layer matrix in deterministic order", () => {
    expect(prgLayerCatalog).toHaveLength(54);
    expect(prgLayerCatalog.map((layer) => layer.layerId)).toEqual(expectedLayerIds);
    expect(new Set(prgLayerCatalog.map((layer) => layer.sourceName))).toHaveLength(54);
    expect(prgLayerCatalogVersion).toBe("2026-06-22");
  });

  it("exposes user-facing metadata and source channels for each layer", () => {
    expect(prgLayerCatalog).toContainEqual({
      layerId: "A07",
      sourceName: "A07_Punkty_adresowe",
      titlePl: "Punkty adresowe",
      category: "address",
      geometryType: "point",
      sourceChannel: "address-package",
    });
    expect(prgLayerCatalog).toContainEqual({
      layerId: "W01",
      sourceName: "W01_Linia_podstawowa_morza_terytorialnego",
      titlePl: "Linia podstawowa morza terytorialnego",
      category: "maritime",
      geometryType: "line",
      sourceChannel: "wfs",
    });
    expect(prgLayerCatalog.filter((layer) => layer.sourceChannel === "wfs")).toHaveLength(52);
    expect(prgLayerCatalog.filter((layer) => layer.sourceChannel === "address-package")).toHaveLength(2);
  });

  it("returns catalog definitions through the application boundary", () => {
    expect(listPrgLayerDefinitions()).toBe(prgLayerCatalog);
  });

  it("looks up a layer by PRG layer id", () => {
    expect(getPrgLayer("A03")).toMatchObject({
      layerId: "A03",
      sourceName: "A03_Granice_gmin",
      titlePl: "Granice gmin",
    });
    expect(getPrgLayer("missing")).toBeUndefined();
  });
});
