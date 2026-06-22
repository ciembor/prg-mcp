export const prgWmsPackageScopeTypes = [
  "country",
  "voivodeship",
  "county",
  "municipality",
] as const;

export type PrgWmsPackageScopeType = (typeof prgWmsPackageScopeTypes)[number];

export type PrgWmsPackageLayer = {
  readonly layerName: string;
  readonly title: string;
  readonly scopeType: PrgWmsPackageScopeType;
  readonly packageKind: "boundaries" | "addresses";
  readonly containsLayerIds: readonly string[];
};

export const prgWmsPackageCatalog = [
  {
    layerName: "granice_administracyjne",
    title: "Granice administracyjne wg województw",
    scopeType: "voivodeship",
    packageKind: "boundaries",
    containsLayerIds: ["A00", "A01", "A02", "A03", "A04", "A05", "A06"],
  },
  {
    layerName: "adresy",
    title: "Adresy i ulice wg gmin",
    scopeType: "municipality",
    packageKind: "addresses",
    containsLayerIds: ["A07", "A08"],
  },
  {
    layerName: "adresy_pow",
    title: "Adresy i ulice wg powiatów",
    scopeType: "county",
    packageKind: "addresses",
    containsLayerIds: ["A07", "A08"],
  },
  {
    layerName: "adresy_woj",
    title: "Adresy i ulice wg województw",
    scopeType: "voivodeship",
    packageKind: "addresses",
    containsLayerIds: ["A07", "A08"],
  },
  {
    layerName: "adresy_zbiorcze",
    title: "Adresy i ulice - dane zbiorcze",
    scopeType: "country",
    packageKind: "addresses",
    containsLayerIds: ["A07", "A08"],
  },
  {
    layerName: "granice_specjalne",
    title: "Granice administracyjne i specjalne",
    scopeType: "country",
    packageKind: "boundaries",
    containsLayerIds: [
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
    ],
  },
] as const satisfies readonly PrgWmsPackageLayer[];

export function listPrgWmsPackageLayers(): readonly PrgWmsPackageLayer[] {
  return prgWmsPackageCatalog;
}
