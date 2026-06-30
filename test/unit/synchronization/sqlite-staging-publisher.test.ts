import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
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
      writeStaging: async (path) => {
        await expect(readFile(path, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
        await writeFile(path, "new");
      },
    });
    const publication = await publisher.stage({} as never, {} as never, {} as never);
    expect(await readFile(targetPath, "utf8")).toBe("old");
    await publisher.publish(publication);
    expect(await readFile(targetPath, "utf8")).toBe("new");
    await publisher.rollback(publication);
    expect(await readFile(targetPath, "utf8")).toBe("old");
  });

  it("removes a newly published target on rollback when no backup existed", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "prg-staging-new-"));
    const targetPath = join(dataDir, "addresses-14.sqlite");
    const publisher = createSqliteStagingPublisher({
      targetPath: () => targetPath,
      writeStaging: async (path) => {
        await writeFile(path, "new");
      },
    });

    const publication = await publisher.stage({} as never, {} as never, {} as never);
    await publisher.publish(publication);
    expect(await readFile(targetPath, "utf8")).toBe("new");
    await publisher.rollback(publication);
    await expect(stat(targetPath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
