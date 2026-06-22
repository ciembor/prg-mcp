import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { prgLayerCatalog } from "../../../src/features/source-catalog/index.js";

type WfsSchemaShapesFixture = {
  readonly source: string;
  readonly capturedAt: string;
  readonly schemaShapes: readonly {
    readonly shapeId: string;
    readonly representativeLayer: string;
    readonly layers: readonly string[];
    readonly fields: readonly string[];
  }[];
};

const fixtureUrl = new URL("./fixtures/wfs-schema-shapes.json", import.meta.url);

describe("WFS schema shape fixture", () => {
  it("covers every WFS PRG layer using local schema-shape fixtures", async () => {
    const fixture = JSON.parse(await readFile(fixtureUrl, "utf8")) as WfsSchemaShapesFixture;
    const fixtureLayers = fixture.schemaShapes.flatMap((shape) => shape.layers);
    const expectedWfsLayers = prgLayerCatalog
      .filter((layer) => layer.sourceChannel === "wfs")
      .map((layer) => layer.sourceName)
      .sort();

    expect(fixture.source).toBe(
      "https://mapy.geoportal.gov.pl/wss/service/PZGIK/PRG/WFS/AdministrativeBoundaries?SERVICE=WFS&VERSION=2.0.0&REQUEST=DescribeFeatureType",
    );
    expect(fixture.capturedAt).toBe("2026-06-22");
    expect(fixture.schemaShapes).toHaveLength(25);
    expect([...fixtureLayers].sort()).toEqual(expectedWfsLayers);
    expect(new Set(fixtureLayers)).toHaveLength(52);
  });

  it("keeps each shape small and focused on schema fields", async () => {
    const fixture = JSON.parse(await readFile(fixtureUrl, "utf8")) as WfsSchemaShapesFixture;

    for (const shape of fixture.schemaShapes) {
      expect(shape.representativeLayer).toBe(shape.layers[0]);
      expect(shape.fields[0], shape.shapeId).toBe("msGeometry");
      expect(shape.fields.length, shape.shapeId).toBeGreaterThan(1);
      expect(new Set(shape.fields).size, shape.shapeId).toBe(shape.fields.length);
    }
  });
});
