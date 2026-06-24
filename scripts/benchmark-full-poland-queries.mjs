import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";

import Database from "better-sqlite3";

const dataDir = resolve(process.env.PRG_DATA_DIR ?? ".prg-data");
const iterations = Number(process.env.PRG_BENCHMARK_ITERATIONS ?? 40);
const warmup = Number(process.env.PRG_BENCHMARK_WARMUP ?? 5);
const voivodeshipCodes = ["02", "04", "06", "08", "10", "12", "14", "16", "18", "20", "22", "24", "26", "28", "30", "32"];
const budgets = {
  exactLookupMs: 50,
  listLayersMs: 50,
  locatePointMs: 300,
  reverseAddressMs: 200,
  textSearchMs: 200,
};

assertFullPolandInstallation();

const catalog = new Database(join(dataDir, "catalog.sqlite"), { readonly: true });
const boundaries = new Database(join(dataDir, "boundaries.sqlite"), { readonly: true });
const addressDatabases = voivodeshipCodes.map((code) => new Database(join(dataDir, `addresses-${code}.sqlite`), { readonly: true }));

try {
  const results = {
    exactLookupMs: measure(() => {
      boundaries.prepare("select * from areas where code = '1465011' or object_id = '1465011' order by snapshot_id desc limit 1").get();
    }),
    listLayersMs: measure(() => {
      catalog.prepare("select count(distinct layer_id) as count from installed_coverage").get();
    }),
    locatePointMs: measure(() => {
      boundaries.prepare(`
        select areas.rowid
        from areas_rtree
        join areas on areas.rowid = areas_rtree.rowid
        where areas_rtree.min_x <= 637807 and areas_rtree.max_x >= 637807
          and areas_rtree.min_y <= 486708 and areas_rtree.max_y >= 486708
        order by areas.layer_id asc, areas.object_id asc
        limit 200
      `).all();
    }),
    reverseAddressMs: measure(() => {
      for (const database of addressDatabases) {
        database.prepare(`
          select addresses.rowid
          from addresses_rtree
          join addresses on addresses.rowid = addresses_rtree.rowid
          where addresses_rtree.min_x <= 638807 and addresses_rtree.max_x >= 636807
            and addresses_rtree.min_y <= 487708 and addresses_rtree.max_y >= 485708
          order by addresses.object_id asc
          limit 500
        `).all();
      }
    }),
    textSearchMs: measure(() => {
      boundaries.prepare("select rowid from areas_fts where areas_fts match 'Warszawa' limit 20").all();
      for (const database of addressDatabases) {
        database.prepare("select rowid from addresses_fts where addresses_fts match 'Warszawa' limit 20").all();
      }
    }),
  };

  const failed = Object.entries(results).filter(([name, value]) => value.p95Ms > budgets[name]);
  const report = {
    budgets,
    dataDir,
    iterations,
    results,
    runtime: {
      arch: process.arch,
      maxRssBytes: process.resourceUsage().maxRSS * 1024,
      node: process.version,
      platform: process.platform,
    },
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (failed.length > 0) {
    const failedBudgets = failed.map(([name, value]) => `${name} p95=${value.p95Ms}ms`).join(", ");
    throw new Error(`Full Poland query budgets exceeded: ${failedBudgets}`);
  }
} finally {
  catalog.close();
  boundaries.close();
  for (const database of addressDatabases) database.close();
}

function measure(callback) {
  const samples = [];
  for (let index = 0; index < warmup + iterations; index += 1) {
    const start = performance.now();
    callback();
    const elapsed = performance.now() - start;
    if (index >= warmup) samples.push(elapsed);
  }
  samples.sort((left, right) => left - right);
  return {
    maxMs: round(samples.at(-1) ?? 0),
    p95Ms: round(samples[Math.ceil(samples.length * 0.95) - 1] ?? 0),
  };
}

function assertFullPolandInstallation() {
  for (const name of ["catalog.sqlite", "boundaries.sqlite"]) {
    if (!existsSync(join(dataDir, name))) throw new Error(`Missing ${name}; run prg-mcp sync --profile poland-full --mode missing first.`);
  }

  for (const code of voivodeshipCodes) {
    if (!existsSync(join(dataDir, `addresses-${code}.sqlite`))) {
      throw new Error(`Missing address shard ${code}; run prg-mcp sync --profile addresses --teryt ${code} --mode missing first.`);
    }
  }

  const catalog = new Database(join(dataDir, "catalog.sqlite"), { readonly: true });
  try {
    const row = catalog.prepare("select count(distinct layer_id) as count from installed_coverage").get();
    if (row.count !== 54) throw new Error(`Full Poland coverage requires 54 installed PRG layers; found ${row.count}.`);
  } finally {
    catalog.close();
  }
}

function round(value) {
  return Number(value.toFixed(2));
}
