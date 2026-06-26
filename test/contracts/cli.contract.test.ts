import { Writable } from "node:stream";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { initializePrgDatabases } from "../../src/features/persistence/index.js";
import { runCli } from "../../src/cli.js";

const contractDataDir = join(process.cwd(), ".tmp", "prg-mcp-cli-contract");

describe("prg-mcp CLI contract", () => {
  it("returns PRG server status", async () => {
    const stdout = new MemoryWritable();

    await runCli(["status"], {
      env: { MCP_DATA_DIR: contractDataDir },
      stderr: new MemoryWritable(),
      stdout,
    });

    expect(JSON.parse(stdout.content)).toMatchObject({
      dataDir: contractDataDir,
      sqlite: { fts5: true, rtree: true },
      transport: "stdio",
    });
    expect(JSON.parse(stdout.content).databaseSchemaVersion).toEqual(expect.any(Number));
  });

  it("lists public tools", async () => {
    const stdout = new MemoryWritable();

    await runCli(["tools"], {
      env: {},
      stderr: new MemoryWritable(),
      stdout,
    });

    expect(JSON.parse(stdout.content)).toEqual({
      tools: [
        {
          description: "Returns package identity, scope, repository, author and database schema version.",
          name: "about",
          policy: "read",
        },
        {
          description: "Returns one PRG address point with IIP identifier, coordinates, postal-code attribute and source provenance.",
          name: "get_address",
          policy: "read",
        },
        {
          description: "Returns one PRG area record with mapped common attributes and raw source attributes, without full geometry.",
          name: "get_area",
          policy: "read",
        },
        {
          description: "Returns PRG area geometry as GeoJSON in EPSG:2180, with optional simplification and vertex limit.",
          name: "get_area_geometry",
          policy: "read",
        },
        {
          description: "Returns one PRG street record with attributes and geometry from installed A08 street data.",
          name: "get_street",
          policy: "read",
        },
        {
          description: "Returns basic server health.",
          name: "health_status",
          policy: "read",
        },
        {
          description: "Lists all 54 PRG layers with purpose, geometry, source channel, local availability, scopes and record counts.",
          name: "list_layers",
          policy: "read",
        },
        {
          description: "Finds all polygon areas covering an EPSG:2180 point; boundary points are included with covers semantics.",
          name: "locate_point",
          policy: "read",
        },
        {
          description: "Finds bounded intersecting PRG areas/lines for one source area; requires layerIds or category and enforces a candidate cost limit.",
          name: "relate_areas",
          policy: "read",
        },
        {
          description: "Finds nearest PRG address points around an EPSG:2180 point using expanding R-tree candidates, exact distance and hard radius/candidate limits.",
          name: "reverse_address",
          policy: "read",
        },
        {
          description: "Searches PRG address points by natural-language text or structured fields; query and structured input are mutually exclusive.",
          name: "search_addresses",
          policy: "read",
        },
        {
          description: "Searches PRG area/territorial-competence records by text, code, category, layer, validity date and snapshot.",
          name: "search_areas",
          policy: "read",
        },
        {
          description: "Searches PRG streets, including street records that have no installed address points when A08 street data is present.",
          name: "search_streets",
          policy: "read",
        },
        {
          description: "Returns local database sizes, schema version, transport and required SQLite extension availability.",
          name: "server_status",
          policy: "read",
        },
        {
          description: "Returns installed PRG coverage by layer and scope; optionally checks source metadata without downloading datasets.",
          name: "source_status",
          policy: "read",
        },
      ],
    });
  });

  it("reports coverage for all PRG layers", async () => {
    const stdout = new MemoryWritable();

    await runCli(["coverage"], {
      env: { MCP_DATA_DIR: contractDataDir },
      stderr: new MemoryWritable(),
      stdout,
    });

    const result = JSON.parse(stdout.content) as { layers: unknown[]; totalLayerCount: number };
    expect(result.totalLayerCount).toBe(54);
    expect(result.layers).toHaveLength(54);
  });

  it("parses source-status --remote=false as a local check", async () => {
    const stdout = new MemoryWritable();

    await runCli(["source-status", "--remote=false"], {
      env: { MCP_DATA_DIR: contractDataDir },
      stderr: new MemoryWritable(),
      stdout,
    });

    expect(JSON.parse(stdout.content)).toMatchObject({
      checkedRemote: false,
      remoteStatus: "not_requested",
    });
  });

  it("validates export numeric limits before reading snapshots", async () => {
    await expect(runCli(["export", "--layer", "A03", "--id", "missing", "--max-vertices", "-1"], {
      env: { MCP_DATA_DIR: contractDataDir },
      stderr: new MemoryWritable(),
      stdout: new MemoryWritable(),
    })).rejects.toThrow("--max-vertices must be at least 4.");
    await expect(runCli(["export", "--layer", "A03", "--id", "missing", "--tolerance-meters", "-1"], {
      env: { MCP_DATA_DIR: contractDataDir },
      stderr: new MemoryWritable(),
      stdout: new MemoryWritable(),
    })).rejects.toThrow("--tolerance-meters must be at least 0.");
  });

  it("exports only snapshots with complete installed coverage", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "prg-cli-incomplete-coverage-"));
    const { catalogPath } = initializePrgDatabases({ addressShardCodes: ["14"], dataDir });
    const database = new Database(catalogPath);
    try {
      database.prepare(`
        insert into snapshots(dataset_key, scope, downloaded_at, checked_at, sha256, record_count, schema_fingerprint, adapter_version, source_url)
        values ('current:A03', 'country:PL', '2026-06-23', '2026-06-23', 'abc', 1, 'schema', 'adapter', 'https://example.test')
      `).run();
      database.prepare(`
        insert into installed_coverage(layer_id, scope_type, scope_code, snapshot_id, completeness)
        values ('A03', 'country', 'PL', last_insert_rowid(), 'partial')
      `).run();
    } finally {
      database.close();
    }

    await expect(runCli(["export", "--layer", "A03", "--id", "gmina"], {
      env: { MCP_DATA_DIR: dataDir },
      stderr: new MemoryWritable(),
      stdout: new MemoryWritable(),
    })).rejects.toThrow("No installed snapshot found for layer A03.");
  });

  it("shows setup estimate for the recommended administrative profile", async () => {
    const stdout = new MemoryWritable();
    const stderr = new MemoryWritable();

    await runCli(["setup"], {
      env: { MCP_DATA_DIR: contractDataDir },
      stderr,
      stdout,
    });

    expect(JSON.parse(stdout.content)).toMatchObject({
      profile: "administrative",
      syncAvailable: false,
      syncStatus: "not_packaged",
      targetCount: 7,
    });
    expect(stderr.content).toContain("Recommended starter profile: administrative.");
  });

  it("requires explicit confirmation for poland-full setup", async () => {
    await expect(runCli(["setup", "--profile", "poland-full"], {
      env: { MCP_DATA_DIR: contractDataDir },
      stderr: new MemoryWritable(),
      stdout: new MemoryWritable(),
    })).rejects.toThrow("poland-full requires --confirm-poland-full");
  });

  it("does not accept --confirm-poland-full=false as confirmation", async () => {
    await expect(runCli(["setup", "--profile", "poland-full", "--confirm-poland-full=false"], {
      env: { MCP_DATA_DIR: contractDataDir },
      stderr: new MemoryWritable(),
      stdout: new MemoryWritable(),
    })).rejects.toThrow("poland-full requires --confirm-poland-full");
  });

  it("requires archive year for administrative history setup", async () => {
    await expect(runCli(["setup", "--profile", "administrative-history"], {
      env: { MCP_DATA_DIR: contractDataDir },
      stderr: new MemoryWritable(),
      stdout: new MemoryWritable(),
    })).rejects.toThrow("administrative-history requires --archive-year");

    const stdout = new MemoryWritable();
    await runCli(["setup", "--profile", "administrative-history", "--archive-year", "2024"], {
      env: { MCP_DATA_DIR: contractDataDir },
      stderr: new MemoryWritable(),
      stdout,
    });

    expect(JSON.parse(stdout.content)).toMatchObject({
      profile: "administrative-history",
      syncStatus: "not_packaged",
    });
  });

  it("keeps setup diagnostics silent when requested", async () => {
    const stderr = new MemoryWritable();

    await runCli(["setup"], {
      env: { MCP_DATA_DIR: contractDataDir, MCP_LOG_LEVEL: "silent" },
      stderr,
      stdout: new MemoryWritable(),
    });

    expect(stderr.content).toBe("");
  });
});

class MemoryWritable extends Writable {
  readonly chunks: string[] = [];

  get content(): string {
    return this.chunks.join("");
  }

  override _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.chunks.push(chunk.toString("utf8"));
    callback();
  }
}
