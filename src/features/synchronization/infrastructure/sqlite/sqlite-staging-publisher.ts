import { randomUUID } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { dirname } from "node:path";

import Database from "better-sqlite3";

import type { DownloadedSyncDataset, StagedPublication, SyncPublisher } from "../../application/run-sync.js";
import type { SnapshotMetadata, SyncTarget } from "../../domain/sync-model.js";

type FilePublication = StagedPublication & { readonly targetPath: string; readonly stagingPath: string; readonly backupPath: string };

export type SqliteStagingPublisherOptions = {
  readonly targetPath: (target: SyncTarget) => string;
  readonly writeStaging: (stagingPath: string, target: SyncTarget, dataset: DownloadedSyncDataset, metadata: SnapshotMetadata) => Promise<void>;
};

export function createSqliteStagingPublisher(options: SqliteStagingPublisherOptions): SyncPublisher {
  return {
    stage: async (target, dataset, metadata) => {
      const targetPath = options.targetPath(target);
      const id = randomUUID();
      const publication: FilePublication = {
        backupPath: `${targetPath}.bak-${id}`,
        id,
        stagingPath: `${targetPath}.staging-${id}`,
        target,
        targetPath,
      };
      await mkdir(dirname(targetPath), { recursive: true });
      try {
        await options.writeStaging(publication.stagingPath, target, dataset, metadata);
        checkpointSqlite(publication.stagingPath);
        return publication;
      } catch (error) {
        await remove(publication.stagingPath);
        throw error;
      }
    },
    publish: async (candidate) => {
      const publication = asFilePublication(candidate);
      await removeSqliteSidecars(publication.backupPath);
      await removeSqliteSidecars(publication.stagingPath);
      if (await exists(publication.targetPath)) {
        checkpointSqlite(publication.targetPath);
        await renameSqliteDatabase(publication.targetPath, publication.backupPath);
      }
      try {
        await renameSqliteDatabase(publication.stagingPath, publication.targetPath);
      } catch (error) {
        if (await exists(publication.backupPath)) await renameSqliteDatabase(publication.backupPath, publication.targetPath);
        throw error;
      }
    },
    rollback: async (candidate) => {
      const publication = asFilePublication(candidate);
      await remove(publication.stagingPath);
      if (await exists(publication.backupPath)) {
        await removeSqliteDatabase(publication.targetPath);
        await renameSqliteDatabase(publication.backupPath, publication.targetPath);
      } else {
        await removeSqliteDatabase(publication.targetPath);
      }
    },
    finalize: async (candidate) => removeSqliteDatabase(asFilePublication(candidate).backupPath),
  };
}

function asFilePublication(publication: StagedPublication): FilePublication {
  return publication as FilePublication;
}

async function exists(path: string): Promise<boolean> {
  try { await stat(path); return true; } catch (error) {
    if (isNodeError(error, "ENOENT")) return false;
    throw error;
  }
}

async function remove(path: string): Promise<void> { await rm(path, { force: true }); }

async function removeSqliteDatabase(path: string): Promise<void> {
  await remove(path);
  await removeSqliteSidecars(path);
}

async function removeSqliteSidecars(path: string): Promise<void> {
  await remove(`${path}-wal`);
  await remove(`${path}-shm`);
}

async function renameSqliteDatabase(from: string, to: string): Promise<void> {
  await removeSqliteDatabase(to);
  await rename(from, to);
}

function checkpointSqlite(path: string): void {
  if (!existsSync(path) || !isSqliteDatabase(path)) {
    return;
  }

  const database = new Database(path);
  try {
    database.pragma("wal_checkpoint(TRUNCATE)");
    database.pragma("journal_mode = DELETE");
  } finally {
    database.close();
  }
}

function isSqliteDatabase(path: string): boolean {
  return readFileSync(path).subarray(0, 16).equals(Buffer.from("SQLite format 3\0", "binary"));
}

function existsSync(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch (error) {
    if (isNodeError(error, "ENOENT")) return false;
    throw error;
  }
}

function isNodeError(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
