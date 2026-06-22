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
          description: "Returns basic server health.",
          name: "health_status",
          policy: "read",
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
