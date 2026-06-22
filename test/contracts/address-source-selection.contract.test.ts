import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const decisionDocUrl = new URL("../../docs/address-source-selection.md", import.meta.url);

describe("address source selection decision", () => {
  it("chooses canonical and fallback address sources explicitly", async () => {
    const document = await readFile(decisionDocUrl, "utf8");

    expect(document).toContain("Kanonicznym źródłem dla A07 Punkty adresowe i A08 Ulice jest nowy GML EMUiA");
    expect(document).toContain("ESRI Shapefile i adres uniwersalny nie są źródłami kanonicznymi");
    expect(document).toContain("Adres uniwersalny CSV nie może oznaczyć A08 jako kompletnego");
    expect(document).toContain("PUWG 1992");
  });
});
