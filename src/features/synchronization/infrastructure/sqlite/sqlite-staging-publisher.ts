import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { dirname } from "node:path";

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
        return publication;
      } catch (error) {
        await remove(publication.stagingPath);
        throw error;
      }
    },
    publish: async (candidate) => {
      const publication = asFilePublication(candidate);
      if (await exists(publication.targetPath)) await rename(publication.targetPath, publication.backupPath);
      try {
        await rename(publication.stagingPath, publication.targetPath);
      } catch (error) {
        if (await exists(publication.backupPath)) await rename(publication.backupPath, publication.targetPath);
        throw error;
      }
    },
    rollback: async (candidate) => {
      const publication = asFilePublication(candidate);
      await remove(publication.stagingPath);
      if (await exists(publication.backupPath)) {
        await remove(publication.targetPath);
        await rename(publication.backupPath, publication.targetPath);
      } else {
        await remove(publication.targetPath);
      }
    },
    finalize: async (candidate) => remove(asFilePublication(candidate).backupPath),
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

function isNodeError(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
