import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, expectTypeOf, it } from "vitest";

import {
  acquirePrgImportLock,
  atomicReplaceFileWithBackup,
  atomicWriteFile,
  isPrgImportLockOrphaned,
  PrgImportLockError,
  recoverInterruptedImport,
  releasePrgImportLock,
  type AcquiredPrgImportLock,
  type AcquirePrgImportLockOptions,
  type PrgImportLockFile,
  type PrgImportRecoveryReport,
} from "../../../src/features/persistence/index.js";

describe("atomic import files", () => {
  it("keeps exported atomic import types intentional", () => {
    expectTypeOf<AcquirePrgImportLockOptions>().toHaveProperty("staleAfterMs").toEqualTypeOf<number>();
    expectTypeOf<AcquiredPrgImportLock>().toHaveProperty("ownerId").toEqualTypeOf<string>();
    expectTypeOf<PrgImportLockFile>().toHaveProperty("pid").toEqualTypeOf<number>();
    expectTypeOf<PrgImportRecoveryReport>().toHaveProperty("removedTemporaryFiles").toEqualTypeOf<readonly string[]>();
  });

  it("writes files atomically without leaving temporary files", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "prg-mcp-atomic-"));
    const targetPath = join(dataDir, "manifest.json");

    await atomicWriteFile(targetPath, "first");
    await atomicWriteFile(targetPath, "second");

    expect(await readFile(targetPath, "utf8")).toBe("second");
    await expect(recoverInterruptedImport(dataDir)).resolves.toEqual({
      removedTemporaryFiles: [],
      restoredBackups: [],
    });
  });

  it("replaces files through staging and removes backup after success", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "prg-mcp-replace-"));
    const targetPath = join(dataDir, "boundaries.sqlite");

    await writeFile(targetPath, "old");
    await atomicReplaceFileWithBackup(targetPath, "new");

    expect(await readFile(targetPath, "utf8")).toBe("new");
    await expect(recoverInterruptedImport(dataDir)).resolves.toEqual({
      removedTemporaryFiles: [],
      restoredBackups: [],
    });
  });

  it("acquires and releases an import lock", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "prg-mcp-lock-"));
    const lockPath = join(dataDir, "sync.lock");
    const lock = await acquirePrgImportLock({
      lockPath,
      ownerId: "sync-1",
      staleAfterMs: 60_000,
      isProcessAlive: () => true,
      now: new Date("2026-06-22T00:00:00.000Z"),
    });

    await expect(
      acquirePrgImportLock({
        lockPath,
        ownerId: "sync-2",
        staleAfterMs: 60_000,
        isProcessAlive: () => true,
        now: new Date("2026-06-22T00:00:01.000Z"),
      }),
    ).rejects.toMatchObject({
      code: "SYNC_LOCKED",
      name: "PrgImportLockError",
    } satisfies Partial<PrgImportLockError>);

    await releasePrgImportLock(lock);
    await expect(readFile(lockPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("detects orphaned locks and lets the next owner recover", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "prg-mcp-orphan-lock-"));
    const lockPath = join(dataDir, "sync.lock");

    await writeFile(
      lockPath,
      JSON.stringify({
        ownerId: "old",
        pid: 123,
        acquiredAt: "2026-06-22T00:00:00.000Z",
        heartbeatAt: "2026-06-22T00:00:00.000Z",
      } satisfies PrgImportLockFile),
    );

    await expect(isPrgImportLockOrphaned(lockPath, new Date("2026-06-22T00:10:00.000Z"), 1_000)).resolves.toBe(true);
    await expect(
      acquirePrgImportLock({
        lockPath,
        ownerId: "new",
        staleAfterMs: 1_000,
        isProcessAlive: () => false,
        now: new Date("2026-06-22T00:10:00.000Z"),
      }),
    ).resolves.toMatchObject({
      ownerId: "new",
    });
  });

  it("recovers interrupted imports by removing staging files and restoring backups if target is missing", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "prg-mcp-recovery-"));
    const targetPath = join(dataDir, "catalog.sqlite");
    const stagingPath = `${targetPath}.staging`;
    const temporaryPath = `${targetPath}.tmp-1-1`;

    await writeFile(stagingPath, "partial");
    await writeFile(temporaryPath, "partial");
    await writeFile(`${targetPath}.bak`, "backup");

    await expect(recoverInterruptedImport(dataDir)).resolves.toEqual({
      removedTemporaryFiles: expect.arrayContaining([stagingPath, temporaryPath]),
      restoredBackups: [targetPath],
    });
    expect(await readFile(targetPath, "utf8")).toBe("backup");
  });
});
