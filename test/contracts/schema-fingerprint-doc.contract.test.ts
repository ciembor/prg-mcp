import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const docUrl = new URL("../../docs/schema-fingerprint.md", import.meta.url);

describe("schema fingerprint documentation", () => {
  it("documents tolerated and breaking schema changes", async () => {
    const document = await readFile(docUrl, "utf8");

    expect(document).toContain("dodatkowe pole");
    expect(document).toContain("zmiana kolejności pól");
    expect(document).toContain("brak pola krytycznego");
    expect(document).toContain("SOURCE_SCHEMA_CHANGED");
  });
});
