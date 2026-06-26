import { randomUUID } from "node:crypto";
import { mkdir, open, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type PrgImportLockFile = {
  readonly ownerId: string;
  readonly pid: number;
  readonly acquiredAt: string;
  readonly heartbeatAt: string;
};

export type AcquirePrgImportLockOptions = {
  readonly lockPath: string;
  readonly ownerId: string;
  readonly now?: Date;
  readonly staleAfterMs: number;
  readonly isProcessAlive?: (pid: number) => boolean;
};

export type AcquiredPrgImportLock = {
  readonly lockPath: string;
  readonly ownerId: string;
  readonly acquiredAt: string;
};

export type PrgImportRecoveryReport = {
  readonly removedTemporaryFiles: readonly string[];
  readonly restoredBackups: readonly string[];
};

export class PrgImportLockError extends Error {
  constructor(
    message: string,
    readonly code: "SYNC_LOCKED" | "SYNC_LOCK_NOT_OWNED",
    readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = "PrgImportLockError";
  }
}

export async function atomicWriteFile(targetPath: string, content: string | Uint8Array): Promise<void> {
  await mkdir(dirname(targetPath), { recursive: true });
  const temporaryPath = createTemporaryPath(targetPath);

  try {
    const file = await open(temporaryPath, "wx");

    try {
      await file.writeFile(content);
      await file.sync();
    } finally {
      await file.close();
    }

    await rename(temporaryPath, targetPath);
  } catch (error) {
    await unlinkIfExists(temporaryPath);
    throw error;
  }
}

export async function atomicReplaceFileWithBackup(targetPath: string, replacementContent: string | Uint8Array): Promise<void> {
  await mkdir(dirname(targetPath), { recursive: true });
  const stagingPath = `${targetPath}.staging`;
  const backupPath = `${targetPath}.bak`;

  await atomicWriteFile(stagingPath, replacementContent);
  await unlinkIfExists(backupPath);

  if (await pathExists(targetPath)) {
    await rename(targetPath, backupPath);
  }

  try {
    await rename(stagingPath, targetPath);
    await unlinkIfExists(backupPath);
  } catch (error) {
    if ((await pathExists(backupPath)) && !(await pathExists(targetPath))) {
      await rename(backupPath, targetPath);
    }

    throw error;
  }
}

export async function acquirePrgImportLock(options: AcquirePrgImportLockOptions): Promise<AcquiredPrgImportLock> {
  await mkdir(dirname(options.lockPath), { recursive: true });
  const now = options.now ?? new Date();
  const lockFile: PrgImportLockFile = {
    ownerId: options.ownerId,
    pid: process.pid,
    acquiredAt: now.toISOString(),
    heartbeatAt: now.toISOString(),
  };

  try {
    await writeFile(options.lockPath, JSON.stringify(lockFile), { flag: "wx" });

    return {
      lockPath: options.lockPath,
      ownerId: options.ownerId,
      acquiredAt: lockFile.acquiredAt,
    };
  } catch (error) {
    if (!isNodeErrorCode(error, "EEXIST")) {
      throw error;
    }
  }

  const existingLock = await readImportLockFile(options.lockPath);

  if (!isOrphanedImportLock(existingLock, now, options.staleAfterMs, options.isProcessAlive ?? defaultIsProcessAlive)) {
    throw new PrgImportLockError("PRG sync is already locked.", "SYNC_LOCKED", {
      lockPath: options.lockPath,
      ownerId: existingLock.ownerId,
      pid: existingLock.pid,
      heartbeatAt: existingLock.heartbeatAt,
    });
  }

  await unlinkIfExists(options.lockPath);

  return acquirePrgImportLock(options);
}

export async function releasePrgImportLock(lock: AcquiredPrgImportLock): Promise<void> {
  const existingLock = await readImportLockFile(lock.lockPath);

  if (existingLock.ownerId !== lock.ownerId) {
    throw new PrgImportLockError("PRG sync lock is owned by another process.", "SYNC_LOCK_NOT_OWNED", {
      lockPath: lock.lockPath,
      ownerId: existingLock.ownerId,
    });
  }

  await unlinkIfExists(lock.lockPath);
}

export async function recoverInterruptedImport(dataDir: string): Promise<PrgImportRecoveryReport> {
  const entries = await readdir(dataDir, { withFileTypes: true });
  const removedTemporaryFiles: string[] = [];
  const restoredBackups: string[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const path = join(dataDir, entry.name);

    if (isTemporaryImportFile(entry.name)) {
      await unlinkIfExists(path);
      removedTemporaryFiles.push(path);
      continue;
    }

    if (entry.name.endsWith(".bak")) {
      const targetPath = path.slice(0, -".bak".length);

      if (!(await pathExists(targetPath))) {
        await rename(path, targetPath);
        restoredBackups.push(targetPath);
      }
    }
  }

  return {
    removedTemporaryFiles,
    restoredBackups,
  };
}

export async function isPrgImportLockOrphaned(lockPath: string, now: Date, staleAfterMs: number): Promise<boolean> {
  return isOrphanedImportLock(await readImportLockFile(lockPath), now, staleAfterMs, defaultIsProcessAlive);
}

function isOrphanedImportLock(
  lockFile: PrgImportLockFile,
  now: Date,
  staleAfterMs: number,
  isProcessAlive: (pid: number) => boolean,
): boolean {
  const heartbeatTime = Date.parse(lockFile.heartbeatAt);
  const staleByTime = Number.isNaN(heartbeatTime) || now.getTime() - heartbeatTime > staleAfterMs;

  return staleByTime || !isProcessAlive(lockFile.pid);
}

async function readImportLockFile(lockPath: string): Promise<PrgImportLockFile> {
  return JSON.parse(await readFile(lockPath, "utf8")) as PrgImportLockFile;
}

function createTemporaryPath(targetPath: string): string {
  return `${targetPath}.tmp-${process.pid}-${Date.now()}-${randomUUID()}`;
}

function isTemporaryImportFile(fileName: string): boolean {
  return fileName.includes(".tmp-") || fileName.endsWith(".staging");
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);

    return true;
  } catch (error) {
    if (isNodeErrorCode(error, "ENOENT")) {
      return false;
    }

    throw error;
  }
}

async function unlinkIfExists(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if (!isNodeErrorCode(error, "ENOENT")) {
      throw error;
    }
  }
}

function defaultIsProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);

    return true;
  } catch {
    return false;
  }
}

function isNodeErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
