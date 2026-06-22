import type { PrgLayer } from "../../source-catalog/domain/prg-layer.js";

export const syncModes = ["missing", "stale", "force"] as const;
export type SyncMode = (typeof syncModes)[number];

export const syncProfiles = [
  "administrative",
  "administrative-history",
  "cadastre-boundaries",
  "jurisdictions",
  "maritime",
  "addresses",
  "boundaries-full",
  "poland-full",
] as const;
export type SyncProfile = (typeof syncProfiles)[number];

export type SyncScope = {
  readonly type: "country" | "voivodeship" | "county" | "municipality";
  readonly code: string;
  readonly shardCode?: string;
};

export type SyncTarget = {
  readonly datasetKey: string;
  readonly layer: PrgLayer;
  readonly scope: SyncScope;
  readonly archiveYear?: number;
  readonly estimatedDownloadBytes: number;
  readonly estimatedDiskBytes: number;
};

export type SyncPlan = {
  readonly mode: SyncMode;
  readonly profile?: SyncProfile;
  readonly targets: readonly SyncTarget[];
  readonly estimatedDownloadBytes: number;
  readonly estimatedDiskBytes: number;
  readonly availableDiskBytes: number;
};

export type SnapshotMetadata = {
  readonly datasetKey: string;
  readonly scope: string;
  readonly stateDate?: string;
  readonly downloadedAt: string;
  readonly checkedAt: string;
  readonly etag?: string;
  readonly lastModified?: string;
  readonly sha256: string;
  readonly recordCount: number;
  readonly schemaFingerprint: string;
  readonly adapterVersion: string;
  readonly sourceUrl: string;
  readonly archiveYear?: number;
};

export type SourceProbe = {
  readonly status: "available" | "changed" | "unavailable" | "schema_changed" | "unknown";
  readonly checkedAt: string;
  readonly etag?: string;
  readonly lastModified?: string;
  readonly schemaFingerprint?: string;
  readonly stateDate?: string;
  readonly sourceUrl: string;
};

export type FreshnessPolicy = {
  readonly maxAgeMs: number;
};

export const defaultFreshnessPolicy: FreshnessPolicy = { maxAgeMs: 24 * 60 * 60 * 1_000 };

export class SyncPlanningError extends Error {
  constructor(
    message: string,
    readonly code: "INVALID_PROFILE" | "INVALID_LAYER" | "INVALID_TERYT" | "ARCHIVE_NOT_AVAILABLE" | "INSUFFICIENT_DISK_SPACE",
    readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = "SyncPlanningError";
  }
}
