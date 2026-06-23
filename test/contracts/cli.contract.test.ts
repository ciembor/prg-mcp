import { Writable } from "node:stream";

import { describe, expect, it } from "vitest";

import { runCli } from "../../src/cli.js";

describe("prg-mcp CLI contract", () => {
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
        {
          description: "Explicitly synchronizes selected PRG profiles, layers and TERYT scopes using missing, stale or force mode.",
          name: "sync_data",
          policy: "write",
        },
      ],
    });
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
