import { performance } from "node:perf_hooks";

import { parseSync } from "@loaders.gl/core";
import { WKBLoader } from "@loaders.gl/wkt";
import booleanIntersects from "@turf/boolean-intersects";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import simplify from "@turf/simplify";
import Database from "better-sqlite3";
import proj4 from "proj4";

const iterations = Number.parseInt(process.env.BENCHMARK_ITERATIONS ?? "100000", 10);

if (!Number.isSafeInteger(iterations) || iterations < 1) {
  throw new Error("BENCHMARK_ITERATIONS must be a positive integer.");
}

const polygon = {
  type: "Feature",
  properties: {},
  geometry: {
    type: "Polygon",
    coordinates: [[[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]],
  },
};
const crossingLine = {
  type: "Feature",
  properties: {},
  geometry: {
    type: "LineString",
    coordinates: [[-1, 50], [101, 50]],
  },
};
const pointWkb = Uint8Array.from([1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 240, 63, 0, 0, 0, 0, 0, 0, 0, 64]);

proj4.defs(
  "EPSG:2180",
  "+proj=tmerc +lat_0=0 +lon_0=19 +k=0.9993 +x_0=500000 +y_0=-5300000 +ellps=GRS80 +units=m +no_defs",
);

const results = {
  runtime: {
    arch: process.arch,
    node: process.version,
    platform: process.platform,
  },
  iterations,
  measurements: {
    sqlite: benchmarkSqlite(iterations),
    wkbDecodeMs: measure(() => {
      for (let index = 0; index < iterations; index += 1) parseSync(pointWkb, WKBLoader);
    }),
    coordinateTransformMs: measure(() => {
      for (let index = 0; index < iterations; index += 1) proj4("EPSG:4326", "EPSG:2180", [21, 52]);
    }),
    pointInPolygonMs: measure(() => {
      for (let index = 0; index < iterations; index += 1) {
        booleanPointInPolygon([index % 101, index % 101], polygon);
      }
    }),
    intersectsMs: measure(() => {
      for (let index = 0; index < iterations; index += 1) booleanIntersects(crossingLine, polygon);
    }),
    simplifyMs: measure(() => {
      for (let index = 0; index < iterations; index += 1) simplify(polygon, { tolerance: 1 });
    }),
  },
};

process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);

function benchmarkSqlite(count) {
  const database = new Database(":memory:");
  database.exec(`
    CREATE TABLE points (id INTEGER PRIMARY KEY, x REAL NOT NULL, y REAL NOT NULL);
    CREATE VIRTUAL TABLE point_index USING rtree(id, min_x, max_x, min_y, max_y);
    CREATE VIRTUAL TABLE point_search USING fts5(name);
  `);
  const insertPoint = database.prepare("INSERT INTO points (id, x, y) VALUES (?, ?, ?)");
  const insertIndex = database.prepare("INSERT INTO point_index VALUES (?, ?, ?, ?, ?)");
  const insertSearch = database.prepare("INSERT INTO point_search (rowid, name) VALUES (?, ?)");
  const insert = database.transaction(() => {
    for (let id = 1; id <= count; id += 1) {
      const x = id % 1000;
      const y = Math.floor(id / 1000);
      insertPoint.run(id, x, y);
      insertIndex.run(id, x, x, y, y);
      insertSearch.run(id, `punkt ${id}`);
    }
  });
  const insertMs = measure(insert);
  const spatialQuery = database.prepare(
    "SELECT count(*) count FROM point_index WHERE min_x <= ? AND max_x >= ? AND min_y <= ? AND max_y >= ?",
  );
  const spatialQueriesMs = measure(() => {
    for (let index = 0; index < 1000; index += 1) spatialQuery.get(500, 490, 50, 40);
  });
  const textQuery = database.prepare("SELECT rowid FROM point_search WHERE point_search MATCH ? LIMIT 20");
  const textQueriesMs = measure(() => {
    for (let index = 0; index < 1000; index += 1) textQuery.all('"punkt 500"');
  });
  const compileOptions = database
    .pragma("compile_options")
    .map((row) => row.compile_options)
    .filter((option) => option === "ENABLE_FTS5" || option === "ENABLE_RTREE");
  database.close();

  return { compileOptions, insertMs, spatialQueriesMs, textQueriesMs };
}

function measure(operation) {
  const startedAt = performance.now();
  operation();
  return Number((performance.now() - startedAt).toFixed(2));
}
