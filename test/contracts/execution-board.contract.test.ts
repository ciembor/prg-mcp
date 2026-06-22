import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("execution board contract", () => {
  it("has exactly one active feature", async () => {
    const board = await readFile(new URL("../../docs/execution-board.md", import.meta.url), "utf8");
    const activeRows = board.split("\n").filter((line) => /^\| PRG-\d+ \| in_progress \|/.test(line));

    expect(activeRows).toEqual([expect.stringContaining("| PRG-011 | in_progress |")]);
  });
});
