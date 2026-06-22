import { createReadStream } from "node:fs";
import { rm, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";

import Database from "better-sqlite3";
import { parse } from "csv-parse";
import { SaxesParser } from "saxes";

const sourceDir = resolve(process.env.PRG_BENCHMARK_SOURCE_DIR ?? ".benchmarks/source");
const databasePath = resolve(process.env.PRG_BENCHMARK_DATABASE ?? ".benchmarks/prg-04.sqlite");
const boundaryDir = join(sourceDir, "boundaries-04");
const addressPath = join(sourceDir, "adruni_04.csv");
const boundaryFiles = [
  "A01_Granice_wojewodztw.gml",
  "A02_Granice_powiatow.gml",
  "A03_Granice_gmin.gml",
  "A05_Granice_jednostek_ewidencyjnych.gml",
  "A06_Granice_obrebow_ewidencyjnych.gml",
];

await rm(databasePath, { force: true });
const database = new Database(databasePath);
database.pragma("journal_mode = WAL");
database.pragma("synchronous = NORMAL");
createSchema(database);

const startedAt = performance.now();
const boundaryStartedAt = performance.now();

for (const filename of boundaryFiles) {
  await importBoundaryFile(database, join(boundaryDir, filename));
}

const boundaryImportMs = performance.now() - boundaryStartedAt;
const addressStartedAt = performance.now();
await importAddresses(database, addressPath);
const addressImportMs = performance.now() - addressStartedAt;
database.pragma("wal_checkpoint(TRUNCATE)");

const result = {
  source: {
    address: await fileDetails(addressPath),
    boundaries: await Promise.all(boundaryFiles.map((name) => fileDetails(join(boundaryDir, name)))),
  },
  output: {
    addressCount: database.prepare("SELECT count(*) count FROM addresses").get().count,
    areaCount: database.prepare("SELECT count(*) count FROM areas").get().count,
    databaseBytes: (await stat(databasePath)).size,
  },
  runtime: {
    arch: process.arch,
    maxRssBytes: process.resourceUsage().maxRSS * 1024,
    node: process.version,
    platform: process.platform,
  },
  timing: {
    addressImportMs: round(addressImportMs),
    boundaryImportMs: round(boundaryImportMs),
    totalImportMs: round(performance.now() - startedAt),
  },
};

database.close();
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

function createSchema(target) {
  target.exec(`
    CREATE TABLE areas (
      id INTEGER PRIMARY KEY,
      layer_id TEXT NOT NULL,
      object_id TEXT NOT NULL,
      code TEXT,
      name TEXT,
      min_x REAL NOT NULL,
      min_y REAL NOT NULL,
      max_x REAL NOT NULL,
      max_y REAL NOT NULL
    );
    CREATE VIRTUAL TABLE area_index USING rtree(id, min_x, max_x, min_y, max_y);
    CREATE VIRTUAL TABLE area_search USING fts5(name, code, content='areas', content_rowid='id');
    CREATE TABLE addresses (
      id INTEGER PRIMARY KEY,
      municipality_code TEXT NOT NULL,
      locality TEXT NOT NULL,
      street TEXT,
      number TEXT NOT NULL,
      x REAL NOT NULL,
      y REAL NOT NULL
    );
    CREATE VIRTUAL TABLE address_index USING rtree(id, min_x, max_x, min_y, max_y);
    CREATE VIRTUAL TABLE address_search USING fts5(locality, street, number, content='addresses', content_rowid='id');
  `);
}

async function importBoundaryFile(target, path) {
  const layerId = basename(path, ".gml").slice(0, 3);
  const insertArea = target.prepare(
    "INSERT INTO areas (layer_id, object_id, code, name, min_x, min_y, max_x, max_y) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const insertIndex = target.prepare("INSERT INTO area_index VALUES (?, ?, ?, ?, ?)");
  const insertSearch = target.prepare("INSERT INTO area_search (rowid, name, code) VALUES (?, ?, ?)");
  const parser = new SaxesParser({ xmlns: true });
  let current;
  let field;
  let text = "";

  parser.on("opentag", (tag) => {
    if (tag.local.startsWith(`${layerId}_`)) {
      current = createArea(String(tag.attributes["gml:id"]?.value ?? `${layerId}-unknown`));
    }
    if (current && ["JPT_KOD_JE", "JPT_NAZWA_", "pos", "posList"].includes(tag.local)) {
      field = tag.local;
      text = "";
    }
  });
  parser.on("text", (value) => {
    if (field) text += value;
  });
  parser.on("closetag", (tag) => {
    if (!current) return;
    if (tag.local === field) {
      applyAreaField(current, field, text);
      field = undefined;
      text = "";
    }
    if (tag.local.startsWith(`${layerId}_`)) {
      const info = insertArea.run(
        layerId,
        current.objectId,
        current.code,
        current.name,
        current.minX,
        current.minY,
        current.maxX,
        current.maxY,
      );
      const id = Number(info.lastInsertRowid);
      insertIndex.run(id, current.minX, current.maxX, current.minY, current.maxY);
      insertSearch.run(id, current.name, current.code);
      current = undefined;
    }
  });
  target.exec("BEGIN");
  for await (const chunk of createReadStream(path, { encoding: "utf8" })) parser.write(chunk);
  parser.close();
  target.exec("COMMIT");
}

function createArea(objectId) {
  return {
    code: "",
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    name: "",
    objectId,
  };
}

function applyAreaField(area, field, value) {
  if (field === "JPT_KOD_JE") area.code = value.trim();
  if (field === "JPT_NAZWA_") area.name = value.trim();
  if (field !== "pos" && field !== "posList") return;
  const coordinates = value.trim().split(/\s+/).map(Number);
  for (let index = 0; index < coordinates.length; index += 2) {
    const x = coordinates[index];
    const y = coordinates[index + 1];
    if (Number.isFinite(x) && Number.isFinite(y)) {
      area.minX = Math.min(area.minX, x);
      area.maxX = Math.max(area.maxX, x);
      area.minY = Math.min(area.minY, y);
      area.maxY = Math.max(area.maxY, y);
    }
  }
}

async function importAddresses(target, path) {
  const insertAddress = target.prepare(
    "INSERT INTO addresses (municipality_code, locality, street, number, x, y) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const insertIndex = target.prepare("INSERT INTO address_index VALUES (?, ?, ?, ?, ?)");
  const insertSearch = target.prepare(
    "INSERT INTO address_search (rowid, locality, street, number) VALUES (?, ?, ?, ?)",
  );
  const records = createReadStream(path).pipe(
    parse({
      bom: true,
      columns: true,
      delimiter: ";",
      relax_column_count: true,
      relax_quotes: true,
      skip_empty_lines: true,
    }),
  );
  target.exec("BEGIN");
  for await (const record of records) {
    const parts = String(record.adruni ?? "").split("|");
    const x = Number(parts[5]);
    const y = Number(parts[6]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const info = insertAddress.run(record.teryt, record.miejscowosc, record.ulica, record.numer, x, y);
    const id = Number(info.lastInsertRowid);
    insertIndex.run(id, x, x, y, y);
    insertSearch.run(id, record.miejscowosc, record.ulica, record.numer);
  }
  target.exec("COMMIT");
}

async function fileDetails(path) {
  const details = await stat(path);
  return { bytes: details.size, name: basename(path), updatedAt: details.mtime.toISOString() };
}

function round(value) {
  return Number(value.toFixed(2));
}
