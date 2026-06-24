import { describe, expect, it } from "vitest";

import {
  bboxOfGeometry,
  centroidOfGeometry,
  decodeWkb,
  encodeWkb,
  geometriesIntersect,
  pointCoveredByPolygon,
  type PolygonGeometry,
} from "../../../src/features/spatial/index.js";

describe("geometry property coverage", () => {
  it("keeps generated rectangle centroids inside bbox and polygon boundary semantics stable", () => {
    for (let seed = 1; seed <= 128; seed += 1) {
      const polygon = rectangle(seed);
      const bbox = bboxOfGeometry(polygon);
      const centroid = centroidOfGeometry(polygon);

      expect(centroid.coordinates[0], `x seed ${seed}`).toBeGreaterThanOrEqual(bbox.minX);
      expect(centroid.coordinates[0], `x seed ${seed}`).toBeLessThanOrEqual(bbox.maxX);
      expect(centroid.coordinates[1], `y seed ${seed}`).toBeGreaterThanOrEqual(bbox.minY);
      expect(centroid.coordinates[1], `y seed ${seed}`).toBeLessThanOrEqual(bbox.maxY);
      expect(pointCoveredByPolygon(centroid, polygon), `centroid seed ${seed}`).toBe(true);
      expect(pointCoveredByPolygon([bbox.minX, bbox.minY], polygon), `boundary seed ${seed}`).toBe(true);
      expect(geometriesIntersect(polygon, polygon), `self intersection seed ${seed}`).toBe(true);
      expect(decodeWkb(encodeWkb(polygon)), `wkb seed ${seed}`).toEqual(polygon);
    }
  });
});

function rectangle(seed: number): PolygonGeometry {
  const x = deterministic(seed, 997) * 10_000;
  const y = deterministic(seed + 41, 991) * 10_000;
  const width = 1 + deterministic(seed + 79, 983) * 500;
  const height = 1 + deterministic(seed + 127, 977) * 500;
  return {
    coordinates: [[
      [x, y],
      [x + width, y],
      [x + width, y + height],
      [x, y + height],
      [x, y],
    ]],
    type: "Polygon",
  };
}

function deterministic(seed: number, modulus: number): number {
  return ((seed * 48271) % modulus) / modulus;
}
