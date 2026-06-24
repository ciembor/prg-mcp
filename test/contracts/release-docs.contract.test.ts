import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { prgLayerCatalog } from "../../src/features/source-catalog/index.js";

describe("release and provenance documentation", () => {
  it("documents every PRG layer in the 54/54 coverage matrix", async () => {
    const matrix = await readFile(new URL("../../docs/layer-coverage.md", import.meta.url), "utf8");

    for (const layer of prgLayerCatalog) {
      expect(matrix, layer.layerId).toContain(`| ${layer.layerId} | \`${layer.sourceName}\``);
    }
    expect(matrix.split("\n").filter((line) => /^\| [A-Z]\d{2} \|/u.test(line))).toHaveLength(54);
  });

  it("keeps every layer mapped to a fixture, public tool path and source adapter", async () => {
    const matrix = await readFile(new URL("../../docs/layer-coverage.md", import.meta.url), "utf8");

    for (const line of matrix.split("\n").filter((row) => /^\| [A-Z]\d{2} \|/u.test(row))) {
      expect(line).toMatch(/\| `[^`]+` \|/u);
      expect(line).toMatch(/\| [^|]*(prg-layer-catalog|area-tools|address-tools)[^|]* \|/u);
      expect(line).toMatch(/\| [^|]*`(search_areas|get_area|locate_point|search_addresses|search_streets)[^|]* \|/u);
      expect(line).toMatch(/\| (WFS AdministrativeBoundaries|PRG address package) \|/u);
    }
  });

  it("documents intent selection across PRG tools and non-PRG registries", async () => {
    const intentSelection = await readFile(new URL("../../docs/intent-selection.md", import.meta.url), "utf8");

    for (const required of [
      "`locate_point`",
      "`search_areas`",
      "`search_addresses`",
      "`reverse_address`",
      "`get_area_geometry`",
      "`source_status`",
      "TERYT",
      "PRNG",
      "EGiB",
      "Poczta Polska",
    ]) {
      expect(intentSelection).toContain(required);
    }
  });

  it("keeps official provenance and source limitations documented", async () => {
    const provenance = await readFile(new URL("../../docs/provenance.md", import.meta.url), "utf8");
    const notice = await readFile(new URL("../../NOTICE.md", import.meta.url), "utf8");

    for (const required of [
      "https://www.geoportal.gov.pl/pl/dane/panstwowy-rejestr-granic-prg/",
      "AdministrativeBoundaries",
      "PanstwowyRejestrGranic",
      "KrajowaIntegracjaNumeracjiAdresowej",
      "Kod pocztowy jest atrybutem punktu adresowego PRG",
    ]) {
      expect(`${provenance}\n${notice}`).toContain(required);
    }
  });

  it("documents platform verification, release criteria and rollback", async () => {
    const release = await readFile(new URL("../../docs/release.md", import.meta.url), "utf8");

    for (const required of [
      "macOS arm64",
      "Linux x64",
      "Windows x64",
      "pnpm test:pack-smoke",
      "pnpm security:audit",
      "benchmark:full-poland",
      "Wydanie `1.0`",
      "Rollback",
    ]) {
      expect(release).toContain(required);
    }
  });
});
