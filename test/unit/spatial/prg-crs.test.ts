import { describe, expect, expectTypeOf, it } from "vitest";

import {
  CoordinateTransformError,
  epsg2180Code,
  epsg2180Definition,
  epsg4326Code,
  roundTrip2180,
  transform2180To4326,
  transform4326To2180,
  type Epsg2180Point,
  type Epsg4326Point,
} from "../../../src/features/spatial/index.js";

describe("PRG CRS transforms", () => {
  it("transforms a PRG EPSG:2180 golden point to explicit WGS84 longitude/latitude", () => {
    const point = transform2180To4326({
      x: 637_807,
      y: 486_708,
    });

    expect(point.longitude).toBeCloseTo(21.018397622768067, 12);
    expect(point.latitude).toBeCloseTo(52.229151521131236, 12);
    expectTypeOf(point).toEqualTypeOf<Epsg4326Point>();
  });

  it("transforms WGS84 longitude/latitude to EPSG:2180 without swapping axis order", () => {
    const point = transform4326To2180({
      longitude: 21.015,
      latitude: 52.229,
    });

    expect(point.x).toBeCloseTo(637_575.5181246095, 8);
    expect(point.y).toBeCloseTo(486_684.6981824972, 8);
    expect(point.x).toBeGreaterThan(point.y);
    expectTypeOf(point).toEqualTypeOf<Epsg2180Point>();
  });

  it("round-trips EPSG:2180 points within sub-millimetre tolerance", () => {
    const source: Epsg2180Point = {
      x: 567_612.3301531181,
      y: 244_581.9564790437,
    };
    const roundTripped = roundTrip2180(source);

    expect(roundTripped.x).toBeCloseTo(source.x, 6);
    expect(roundTripped.y).toBeCloseTo(source.y, 6);
  });

  it("exposes stable CRS metadata and rejects invalid input", () => {
    expect(epsg2180Code).toBe("EPSG:2180");
    expect(epsg4326Code).toBe("EPSG:4326");
    expect(epsg2180Definition).toContain("+proj=tmerc");
    expect(() =>
      transform4326To2180({
        longitude: 52.229,
        latitude: 181,
      }),
    ).toThrow(CoordinateTransformError);
  });
});
