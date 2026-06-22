import { mkdir, statfs } from "node:fs/promises";

import type { PrgConfig } from "../../../runtime/config.js";
import { PrgImportLockError } from "../../persistence/index.js";
import {
  planSync,
  SyncPlanningError,
  SyncValidationError,
  type SyncMode,
  type SyncProfile,
  type SyncRunResult,
} from "../../synchronization/index.js";
import { WfsClientError } from "../../source-catalog/index.js";

export const syncDataErrorCodes = [
  "INSUFFICIENT_DISK_SPACE", "SOURCE_UNAVAILABLE", "SYNC_LOCKED", "SCHEMA_CHANGED", "VALIDATION_FAILED",
] as const;
export type SyncDataErrorCode = (typeof syncDataErrorCodes)[number];

export type SyncDataInput = {
  readonly mode: SyncMode;
  readonly profile?: SyncProfile;
  readonly layerIds?: readonly string[];
  readonly teryt?: readonly string[];
  readonly archiveYear?: number;
};
export type SyncDataRunner = { readonly run: (plan: ReturnType<typeof planSync>) => Promise<SyncRunResult> };
export type SyncDataResult = {
  readonly plan: { readonly estimatedDownloadBytes: number; readonly estimatedDiskBytes: number; readonly targetCount: number };
  readonly run: SyncRunResult;
};

export class SyncDataToolError extends Error {
  constructor(message: string, readonly code: SyncDataErrorCode, readonly details: Readonly<Record<string, unknown>> = {}) {
    super(message);
    this.name = "SyncDataToolError";
  }
}

export async function syncData(config: PrgConfig, input: SyncDataInput, runner: SyncDataRunner): Promise<SyncDataResult> {
  await mkdir(config.dataDir, { recursive: true });
  try {
    const disk = await statfs(config.dataDir);
    const plan = planSync({ ...input, availableDiskBytes: disk.bavail * disk.bsize });
    const run = await runner.run(plan);
    return {
      plan: { estimatedDiskBytes: plan.estimatedDiskBytes, estimatedDownloadBytes: plan.estimatedDownloadBytes, targetCount: plan.targets.length },
      run,
    };
  } catch (error) {
    throw normalizeSyncError(error);
  }
}

export const unavailableSyncDataRunner: SyncDataRunner = {
  run: async () => { throw new SyncDataToolError("No PRG source adapter is configured.", "SOURCE_UNAVAILABLE"); },
};

function normalizeSyncError(error: unknown): SyncDataToolError {
  if (error instanceof SyncDataToolError) return error;
  if (error instanceof PrgImportLockError) return new SyncDataToolError(error.message, "SYNC_LOCKED", error.details);
  if (error instanceof SyncValidationError) return new SyncDataToolError(error.message, "VALIDATION_FAILED", error.details);
  if (error instanceof SyncPlanningError) {
    const code = error.code === "INSUFFICIENT_DISK_SPACE" ? "INSUFFICIENT_DISK_SPACE" : "VALIDATION_FAILED";
    return new SyncDataToolError(error.message, code, error.details);
  }
  if (error instanceof WfsClientError) return new SyncDataToolError(error.message, "SOURCE_UNAVAILABLE", error.details);
  if (error instanceof Error && error.message.includes("schema")) return new SyncDataToolError(error.message, "SCHEMA_CHANGED");
  return new SyncDataToolError(error instanceof Error ? error.message : String(error), "SOURCE_UNAVAILABLE");
}
