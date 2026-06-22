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
