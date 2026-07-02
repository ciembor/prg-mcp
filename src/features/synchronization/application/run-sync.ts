import { createHash, randomUUID } from "node:crypto";

import type { SnapshotMetadata, SourceProbe, SyncPlan, SyncTarget } from "../domain/sync-model.js";
import { validateSyncDataset, type SyncRecord } from "../domain/sync-validation.js";
import { shouldSynchronize } from "./source-status.js";

export type DownloadedSyncDataset = {
  readonly bytes: Uint8Array;
  readonly records: readonly SyncRecord[];
  readonly sourceUrl: string;
  readonly stateDate?: string;
  readonly etag?: string;
  readonly lastModified?: string;
  readonly schemaFingerprint: string;
  readonly adapterVersion: string;
};

export type SyncSource = {
  readonly probe: (target: SyncTarget, conditional?: { readonly etag?: string; readonly lastModified?: string }) => Promise<SourceProbe>;
  readonly download: (target: SyncTarget, conditional?: { readonly etag?: string; readonly lastModified?: string }) => Promise<DownloadedSyncDataset>;
};

export type StagedPublication = { readonly id: string; readonly target: SyncTarget };
export type SyncPublisher = {
  readonly stage: (target: SyncTarget, dataset: DownloadedSyncDataset, metadata: SnapshotMetadata) => Promise<StagedPublication>;
  readonly publish: (publication: StagedPublication) => Promise<void>;
  readonly rollback: (publication: StagedPublication) => Promise<void>;
  readonly finalize?: (publication: StagedPublication) => Promise<void>;
};

export type SnapshotStore = {
  readonly find: (datasetKey: string, scope: string) => Promise<SnapshotMetadata | undefined>;
  readonly save: (metadata: SnapshotMetadata, target: SyncTarget) => Promise<void>;
};

export type SyncTargetResult = {
  readonly datasetKey: string;
  readonly scope: string;
  readonly status: "published" | "unchanged" | "failed";
  readonly recordCount?: number;
  readonly error?: string;
};

export type SyncRunResult = { readonly runId: string; readonly status: "complete" | "partial" | "failed"; readonly targets: readonly SyncTargetResult[] };

export async function runSyncPlan(
  plan: SyncPlan,
  dependencies: { readonly source: SyncSource; readonly publisher: SyncPublisher; readonly snapshots: SnapshotStore; readonly now?: () => Date },
): Promise<SyncRunResult> {
  const runId = randomUUID();
  const results: SyncTargetResult[] = [];

  for (const target of plan.targets) results.push(await synchronizeTarget(plan, target, dependencies));

  const failures = results.filter((result) => result.status === "failed").length;
  return { runId, status: runStatus(failures, results.length), targets: results };
}

type SyncDependencies = { readonly source: SyncSource; readonly publisher: SyncPublisher; readonly snapshots: SnapshotStore; readonly now?: () => Date };

async function synchronizeTarget(plan: SyncPlan, target: SyncTarget, dependencies: SyncDependencies): Promise<SyncTargetResult> {
  const scope = `${target.scope.type}:${target.scope.code}`;
  let staged: StagedPublication | undefined;
  let catalogSaved = false;
  try {
    const previous = await dependencies.snapshots.find(target.datasetKey, scope);
    if (plan.mode === "missing" && previous) {
      return { datasetKey: target.datasetKey, scope, status: "unchanged" };
    }
    const conditional = previous && !target.archiveYear ? { etag: previous.etag, lastModified: previous.lastModified } : undefined;
    const probe = target.archiveYear ? undefined : await dependencies.source.probe(target, conditional);
    assertProbeUsable(plan.mode, probe);
    if (isUnchangedArchive(target, previous) || !shouldSynchronize(plan.mode, previous, probe, (dependencies.now ?? (() => new Date()))())) {
      return { datasetKey: target.datasetKey, scope, status: "unchanged" };
    }
    const dataset = await dependencies.source.download(target, conditional);
    const metadata = createMetadata(target, scope, dataset, dependencies.now);
    validateSyncDataset({ target, metadata, records: dataset.records });
    staged = await dependencies.publisher.stage(target, dataset, metadata);
    await dependencies.publisher.publish(staged);
    await dependencies.snapshots.save(metadata, target);
    catalogSaved = true;
    try {
      await dependencies.publisher.finalize?.(staged);
    } catch {
      // Publication and catalog metadata are already durable; cleanup can be retried by recovery.
    }
    return { datasetKey: target.datasetKey, scope, status: "published", recordCount: dataset.records.length };
  } catch (error) {
    if (staged && !catalogSaved) await dependencies.publisher.rollback(staged);
    return { datasetKey: target.datasetKey, scope, status: "failed", error: errorMessage(error) };
  }
}

function createMetadata(target: SyncTarget, scope: string, dataset: DownloadedSyncDataset, nowProvider?: () => Date): SnapshotMetadata {
  const now = (nowProvider ?? (() => new Date()))().toISOString();
  return {
    adapterVersion: dataset.adapterVersion, archiveYear: target.archiveYear, checkedAt: now,
    datasetKey: target.datasetKey, downloadedAt: now, etag: dataset.etag, lastModified: dataset.lastModified,
    recordCount: dataset.records.length, schemaFingerprint: dataset.schemaFingerprint, scope,
    sha256: createHash("sha256").update(dataset.bytes).digest("hex"), sourceUrl: dataset.sourceUrl, stateDate: dataset.stateDate,
  };
}

function isUnchangedArchive(target: SyncTarget, previous: SnapshotMetadata | undefined): boolean {
  return target.archiveYear !== undefined && previous !== undefined;
}

function assertProbeUsable(mode: SyncPlan["mode"], probe: SourceProbe | undefined): void {
  if (!probe || probe.status === "available" || probe.status === "changed") return;
  if (mode === "force" && probe.status === "schema_changed") return;
  throw new Error(`Source status prevents synchronization: ${probe.status}.`);
}

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }

function runStatus(failures: number, total: number): SyncRunResult["status"] {
  if (failures === 0) return "complete";
  return failures === total ? "failed" : "partial";
}
