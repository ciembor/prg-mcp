import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createSqliteStagingPublisher } from "../../../src/features/synchronization/index.js";

describe("SQLite staging publisher", () => {
  it("keeps the previous file until publication is finalized and can roll back", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "prg-staging-"));
    const targetPath = join(dataDir, "boundaries.sqlite");
    await writeFile(targetPath, "old");
    const publisher = createSqliteStagingPublisher({
      targetPath: () => targetPath,
      writeStaging: async (path) => writeFile(path, "new"),
    });
    const publication = await publisher.stage({} as never, {} as never, {} as never);
    expect(await readFile(targetPath, "utf8")).toBe("old");
    await publisher.publish(publication);
    expect(await readFile(targetPath, "utf8")).toBe("new");
    await publisher.rollback(publication);
    expect(await readFile(targetPath, "utf8")).toBe("old");
  });
});
