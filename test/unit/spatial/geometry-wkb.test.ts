import { describe, expect, expectTypeOf, it } from "vitest";

import {
  WkbError,
  bboxOfGeometry,
  centroidOfGeometry,
  decodeWkb,
  encodeWkb,
  geometriesIntersect,
  pointCoveredByPolygon,
  toRtreeRow,
  toSqliteRtreeValues,
  type BoundingBox,
  type LineStringGeometry,
  type MultiLineStringGeometry,
  type MultiPointGeometry,
  type MultiPolygonGeometry,
  type PointGeometry,
  type PolygonGeometry,
  type Position,
  type PrgGeometry,
  type RtreeRow,
} from "../../../src/features/spatial/index.js";

describe("geometry operations and WKB", () => {
  it("round-trips WKB for Point, LineString, Polygon and Multi* geometries", () => {
    const geometries: PrgGeometry[] = [
      point,
      line,
      polygonWithHole,
      multiPoint,
      multiLineString,
      multiPolygon,
    ];

    for (const geometry of geometries) {
      expect(decodeWkb(encodeWkb(geometry))).toEqual(geometry);
    }

    expect(() => decodeWkb(Uint8Array.from([1, 99, 0, 0, 0]))).toThrow(WkbError);
  });

  it("computes bbox and centroid for point, line and polygon holes", () => {
    expect(bboxOfGeometry(point)).toEqual({
      maxX: 1,
      maxY: 2,
      minX: 1,
      minY: 2,
    });
    expect(centroidOfGeometry(line)).toEqual({
      coordinates: [1.5, 0.5],
      type: "Point",
    });
    expect(centroidOfGeometry(polygonWithHole).coordinates).toEqual([2, 2]);
    expectTypeOf(bboxOfGeometry(multiPolygon)).toEqualTypeOf<BoundingBox>();
  });

  it("creates deterministic R-tree rows and SQLite values", () => {
    const bbox = bboxOfGeometry(polygonWithHole);
    const row = toRtreeRow(42, bbox);

    expect(row).toEqual({
      id: 42,
      maxX: 4,
      maxY: 4,
      minX: 0,
      minY: 0,
    });
    expect(toSqliteRtreeValues(row)).toEqual([42, 0, 4, 0, 4]);
    expectTypeOf(row).toEqualTypeOf<RtreeRow>();
  });

  it("evaluates geometry predicates across polygons, multipolygons and holes", () => {
    expect(pointCoveredByPolygon([0.5, 0.5], polygonWithHole)).toBe(true);
    expect(pointCoveredByPolygon([2, 2], polygonWithHole)).toBe(false);
    expect(pointCoveredByPolygon([0, 0], polygonWithHole)).toBe(true);
    expect(geometriesIntersect(line, multiPolygon)).toBe(true);
    expect(geometriesIntersect({
      coordinates: [10, 10],
      type: "Point",
    }, polygonWithHole)).toBe(false);
  });

  it("keeps exported geometry type contracts visible", () => {
    expectTypeOf<Position>().toEqualTypeOf<readonly [number, number]>();
    expectTypeOf<PointGeometry>().toMatchTypeOf<PrgGeometry>();
    expectTypeOf<LineStringGeometry>().toMatchTypeOf<PrgGeometry>();
    expectTypeOf<PolygonGeometry>().toMatchTypeOf<PrgGeometry>();
    expectTypeOf<MultiPointGeometry>().toMatchTypeOf<PrgGeometry>();
    expectTypeOf<MultiLineStringGeometry>().toMatchTypeOf<PrgGeometry>();
    expectTypeOf<MultiPolygonGeometry>().toMatchTypeOf<PrgGeometry>();
  });
});

const point: PointGeometry = {
  coordinates: [1, 2],
  type: "Point",
};

const line: LineStringGeometry = {
  coordinates: [
    [0, 0],
    [2, 0],
    [2, 2],
  ],
  type: "LineString",
};

const polygonWithHole: PolygonGeometry = {
  coordinates: [
    [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
      [0, 0],
    ],
    [
      [1, 1],
      [3, 1],
      [3, 3],
      [1, 3],
      [1, 1],
    ],
  ],
  type: "Polygon",
};

const multiPoint: MultiPointGeometry = {
  coordinates: [
    [1, 1],
    [2, 2],
  ],
  type: "MultiPoint",
};

const multiLineString: MultiLineStringGeometry = {
  coordinates: [
    [
      [0, 0],
      [1, 1],
    ],
    [
      [1, 1],
      [2, 1],
    ],
  ],
  type: "MultiLineString",
};

const multiPolygon: MultiPolygonGeometry = {
  coordinates: [
    polygonWithHole.coordinates,
    [
      [
        [5, 5],
        [6, 5],
        [6, 6],
        [5, 6],
        [5, 5],
      ],
    ],
  ],
  type: "MultiPolygon",
};
