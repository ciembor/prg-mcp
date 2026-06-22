import { describe, expect, expectTypeOf, it } from "vitest";

import {
  getPrgArchivalBoundaryPackage,
  listPrgArchivalBoundaryPackages,
  prgArchivalBoundaryCatalog,
  prgArchivalBoundaryCatalogVersion,
  validatePrgPackageUrl,
  type PrgArchivalBoundaryPackage,
} from "../../../src/features/source-catalog/index.js";

const officialYears = [
  2005,
  2006,
  2007,
  2008,
  2009,
  2010,
  2011,
  2012,
  2015,
  2016,
  2017,
  2018,
  2019,
  2020,
  2021,
  2022,
  2023,
  2024,
  2025,
] as const;

describe("PRG archival boundary package catalog", () => {
  it("keeps exported archival package types intentional", () => {
    expectTypeOf<PrgArchivalBoundaryPackage>().toMatchTypeOf<{
      year: number;
      stateDate: string;
      sourceUrl: string;
      containsLayerIds: readonly string[];
    }>();
  });

  it("lists only official archival package years and does not infer missing years", () => {
    expect(prgArchivalBoundaryCatalogVersion).toBe("2026-06-22");
    expect(prgArchivalBoundaryCatalog.map((entry) => entry.year)).toEqual(officialYears);
    expect(getPrgArchivalBoundaryPackage(2013)).toBeUndefined();
    expect(getPrgArchivalBoundaryPackage(2014)).toBeUndefined();
    expect(listPrgArchivalBoundaryPackages()).toBe(prgArchivalBoundaryCatalog);
  });

  it("preserves year, state date, official label and source URL", () => {
    expect(getPrgArchivalBoundaryPackage(2025)).toEqual({
      year: 2025,
      stateDate: "2025-01-01",
      sourceLabel: "PRG jednostki administracyjne 2025",
      sourceUrl: "https://opendata.geoportal.gov.pl/prg/granice_archiwalne/PRG_jednostki_administracyjne_2025.zip",
      sourcePageUrl: "https://www.geoportal.gov.pl/pl/dane/panstwowy-rejestr-granic-prg/",
      containsLayerIds: ["A00", "A01", "A02", "A03", "A04"],
    });
  });

  it("uses package URLs accepted by the PRG package allowlist", () => {
    for (const entry of prgArchivalBoundaryCatalog) {
      expect(validatePrgPackageUrl(entry.sourceUrl).hostname).toBe("opendata.geoportal.gov.pl");
    }
  });
});
