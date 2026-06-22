const archivalBoundaryLayerIds = ["A00", "A01", "A02", "A03", "A04"] as const;
const sourcePageUrl = "https://www.geoportal.gov.pl/pl/dane/panstwowy-rejestr-granic-prg/";

export type PrgArchivalBoundaryPackage = {
  readonly year: number;
  readonly stateDate: string;
  readonly sourceLabel: string;
  readonly sourceUrl: string;
  readonly sourcePageUrl: string;
  readonly containsLayerIds: readonly (typeof archivalBoundaryLayerIds)[number][];
};

export const prgArchivalBoundaryCatalogVersion = "2026-06-22";

export const prgArchivalBoundaryCatalog = [
  archivalPackage(2005),
  archivalPackage(2006),
  archivalPackage(2007),
  archivalPackage(2008),
  archivalPackage(2009),
  archivalPackage(2010),
  archivalPackage(2011),
  archivalPackage(2012),
  archivalPackage(2015),
  archivalPackage(2016),
  archivalPackage(2017),
  archivalPackage(2018),
  archivalPackage(2019),
  archivalPackage(2020),
  archivalPackage(2021),
  archivalPackage(2022),
  archivalPackage(2023),
  archivalPackage(2024),
  archivalPackage(2025),
] as const satisfies readonly PrgArchivalBoundaryPackage[];

export function listPrgArchivalBoundaryPackages(): readonly PrgArchivalBoundaryPackage[] {
  return prgArchivalBoundaryCatalog;
}

export function getPrgArchivalBoundaryPackage(year: number): PrgArchivalBoundaryPackage | undefined {
  return prgArchivalBoundaryCatalog.find((archivalPackageDefinition) => archivalPackageDefinition.year === year);
}

function archivalPackage(year: number): PrgArchivalBoundaryPackage {
  return {
    year,
    stateDate: `${year}-01-01`,
    sourceLabel: `PRG jednostki administracyjne ${year}`,
    sourceUrl: `https://opendata.geoportal.gov.pl/prg/granice_archiwalne/PRG_jednostki_administracyjne_${year}.zip`,
    sourcePageUrl,
    containsLayerIds: archivalBoundaryLayerIds,
  };
}
