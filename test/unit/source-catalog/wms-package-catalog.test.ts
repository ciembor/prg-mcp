import { readFile } from "node:fs/promises";

import { describe, expect, expectTypeOf, it } from "vitest";

import {
  checkWmsPackageCatalog,
  isAllowedPrgPackageHost,
  listPrgWmsPackageLayers,
  parseWmsCapabilities,
  prgWmsPackageCatalog,
  resolvePrgPackageRedirects,
  validatePrgPackageRedirectChain,
  validatePrgPackageUrl,
  WmsPackageRedirectError,
  type PrgWmsPackageLayer,
  type PrgWmsPackageScopeType,
  type ResolvedWmsPackageRedirect,
  type WmsCapabilities,
  type WmsLayer,
  type WmsPackageCatalogReport,
  type WmsPackageLayerChange,
  type WmsPackageLayerIssue,
  type WmsRedirectFetch,
  type WmsRedirectFetchInit,
  type WmsRedirectResponse,
} from "../../../src/features/source-catalog/index.js";

const fixtureUrl = new URL("./fixtures/wms-capabilities-minimal.xml", import.meta.url);

describe("WMS PRG package catalog", () => {
  it("defines package discovery layers from the PRG WMS catalog", () => {
    expect(prgWmsPackageCatalog.map((layer) => layer.layerName)).toEqual([
      "granice_administracyjne",
      "adresy",
      "adresy_pow",
      "adresy_woj",
      "adresy_zbiorcze",
      "granice_specjalne",
    ]);
    expect(listPrgWmsPackageLayers()).toBe(prgWmsPackageCatalog);
    expect(prgWmsPackageCatalog.find((layer) => layer.layerName === "adresy")).toMatchObject({
      scopeType: "municipality",
      packageKind: "addresses",
      containsLayerIds: ["A07", "A08"],
    });
  });

  it("keeps exported WMS package types intentional", () => {
    expectTypeOf<PrgWmsPackageLayer>().toHaveProperty("scopeType").toEqualTypeOf<PrgWmsPackageScopeType>();
    expectTypeOf<WmsCapabilities>().toHaveProperty("layers").toEqualTypeOf<readonly WmsLayer[]>();
    expectTypeOf<WmsPackageCatalogReport>().toHaveProperty("changed").toEqualTypeOf<readonly WmsPackageLayerChange[]>();
    expectTypeOf<WmsPackageLayerChange>().toHaveProperty("issues").toEqualTypeOf<readonly WmsPackageLayerIssue[]>();
    expectTypeOf<ResolvedWmsPackageRedirect>().toHaveProperty("chain").toEqualTypeOf<readonly string[]>();
    expectTypeOf<WmsRedirectFetch>().toEqualTypeOf<(url: string, init: WmsRedirectFetchInit) => Promise<WmsRedirectResponse>>();
  });

  it("parses queryable WMS layers and ignores style names", async () => {
    const capabilities = parseWmsCapabilities(await readFile(fixtureUrl, "utf8"));

    expect(capabilities.layers).toContainEqual({
      name: "granice_administracyjne",
      title: "Granice administracyjne wg województw",
      queryable: true,
    });
    expect(capabilities.layers.map((layer) => layer.name)).not.toContain("default");
  });

  it("checks WMS capabilities against the static package catalog", async () => {
    const capabilities = parseWmsCapabilities(await readFile(fixtureUrl, "utf8"));

    expect(checkWmsPackageCatalog(capabilities)).toEqual({
      ok: true,
      missing: [],
      unexpected: [],
      changed: [],
    });
  });

  it("detects missing, unexpected and changed package layers", () => {
    expect(
      checkWmsPackageCatalog({
        layers: [
          {
            name: "granice_administracyjne",
            title: "Renamed",
            queryable: false,
          },
          {
            name: "unexpected",
            title: "Unexpected",
            queryable: true,
          },
        ],
      }),
    ).toMatchObject({
      ok: false,
      missing: ["adresy", "adresy_pow", "adresy_woj", "adresy_zbiorcze", "granice_specjalne"],
      unexpected: ["unexpected"],
      changed: [
        {
          layerName: "granice_administracyjne",
          issues: [
            {
              kind: "title",
              expected: "Granice administracyjne wg województw",
              actual: "Renamed",
            },
            {
              kind: "queryable",
              expected: true,
              actual: false,
            },
          ],
        },
      ],
    });
  });
});

describe("WMS PRG package redirect validation", () => {
  it("allows only official GUGiK and Geoportal hosts", () => {
    expect(isAllowedPrgPackageHost("mapy.geoportal.gov.pl")).toBe(true);
    expect(isAllowedPrgPackageHost("opendata.geoportal.gov.pl")).toBe(true);
    expect(isAllowedPrgPackageHost("gugik.gov.pl")).toBe(true);
    expect(isAllowedPrgPackageHost("evilgeoportal.gov.pl")).toBe(false);
    expect(() => validatePrgPackageUrl("https://evil.example/prg.zip")).toThrow(WmsPackageRedirectError);
    expect(validatePrgPackageUrl("https://mapy.geoportal.gov.pl/prg.zip").hostname).toBe("mapy.geoportal.gov.pl");
  });

  it("validates every URL in a redirect chain", () => {
    expect(
      validatePrgPackageRedirectChain([
        "https://mapy.geoportal.gov.pl/download",
        "https://opendata.geoportal.gov.pl/prg.zip",
      ]),
    ).toEqual({
      finalUrl: "https://opendata.geoportal.gov.pl/prg.zip",
      chain: ["https://mapy.geoportal.gov.pl/download", "https://opendata.geoportal.gov.pl/prg.zip"],
    });
    expect(() =>
      validatePrgPackageRedirectChain(["https://mapy.geoportal.gov.pl/download", "https://attacker.example/prg.zip"]),
    ).toThrow(WmsPackageRedirectError);
  });

  it("resolves redirects manually and rejects untrusted targets", async () => {
    const fetchRedirect: WmsRedirectFetch = async (url) => {
      if (url === "https://mapy.geoportal.gov.pl/download") {
        return redirectResponse(302, "/safe/prg.zip");
      }

      return redirectResponse(200);
    };

    await expect(resolvePrgPackageRedirects("https://mapy.geoportal.gov.pl/download", fetchRedirect)).resolves.toEqual({
      finalUrl: "https://mapy.geoportal.gov.pl/safe/prg.zip",
      chain: ["https://mapy.geoportal.gov.pl/download", "https://mapy.geoportal.gov.pl/safe/prg.zip"],
    });

    await expect(
      resolvePrgPackageRedirects("https://mapy.geoportal.gov.pl/download", async () => redirectResponse(302, "https://attacker.example/prg.zip")),
    ).rejects.toMatchObject({
      code: "UNTRUSTED_REDIRECT_HOST",
    });
  });
});

function redirectResponse(status: number, location?: string): WmsRedirectResponse {
  return {
    status,
    headers: {
      get: (name) => (name.toLowerCase() === "location" ? (location ?? null) : null),
    },
  };
}
