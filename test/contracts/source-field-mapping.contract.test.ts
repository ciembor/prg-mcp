import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const mappingDocUrl = new URL("../../docs/source-field-mapping.md", import.meta.url);

describe("source field mapping documentation", () => {
  it("documents critical WFS/SHP abbreviations used by PRG adapters", async () => {
    const document = await readFile(mappingDocUrl, "utf8");

    for (const requiredField of [
      "JPT_KOD_JE",
      "JPT_NAZWA_",
      "IIP_PRZEST",
      "IIP_IDENTY",
      "IIP_WERSJA",
      "WERSJA_OD",
      "WAZNY_OD",
      "REGON",
      "SHAPE_AREA",
    ]) {
      expect(document, requiredField).toContain(requiredField);
    }

    expect(document).toContain("Adresy (A07) i ulice (A08) nie pochodzą z WFS AdministrativeBoundaries");
  });
});
