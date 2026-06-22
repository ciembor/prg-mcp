import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const oldFixtureUrl = new URL("./fixtures/emuia-2012-address.gml", import.meta.url);
const newFixtureUrl = new URL("./fixtures/emuia-2021-address.gml", import.meta.url);
const mappingDocUrl = new URL("../../../docs/emuia-migration-mapping.md", import.meta.url);

describe("EMUiA migration fixtures", () => {
  it("covers old and new GML classes needed by A07 and A08", async () => {
    const oldGml = await readFile(oldFixtureUrl, "utf8");
    const newGml = await readFile(newFixtureUrl, "utf8");

    expect(oldGml).toContain("urn:gugik:emuia:2012");
    expect(oldGml).toContain("AD_PunktAdresowy");
    expect(oldGml).toContain("AD_Ulica");
    expect(oldGml).toContain("BT_Identyfikator");
    expect(oldGml).toContain("pozycja");

    expect(newGml).toContain("urn:gugik:emuia:2021");
    expect(newGml).toContain("AD_PunktAdresowy");
    expect(newGml).toContain("AD_UlicaPlac");
    expect(newGml).toContain("AD_IdentyfikatorIIP");
    expect(newGml).toContain("georeferencja");
    expect(newGml).toContain("identyfikatorULIC");
  });

  it("documents the migration mapping table for critical address and street fields", async () => {
    const document = await readFile(mappingDocUrl, "utf8");

    for (const requiredMapping of [
      "BT_Identyfikator.lokalnyId",
      "AD_IdentyfikatorIIP.lokalnyId",
      "AD_PunktAdresowy.pozycja",
      "AD_PunktAdresowy.georeferencja",
      "AD_UlicaPlac.nazwaPelna",
      "AD_UlicaPlac.identyfikatorULIC",
    ]) {
      expect(document).toContain(requiredMapping);
    }
  });
});
