import { defaultFreshnessPolicy, type FreshnessPolicy, type SnapshotMetadata, type SourceProbe } from "../domain/sync-model.js";

export function isFresh(snapshot: SnapshotMetadata, now: Date, policy: FreshnessPolicy = defaultFreshnessPolicy): boolean {
  const checkedAt = Date.parse(snapshot.checkedAt);
  return Number.isFinite(checkedAt) && now.getTime() - checkedAt < policy.maxAgeMs;
}

export function classifySourceProbe(snapshot: SnapshotMetadata | undefined, probe: Omit<SourceProbe, "status">): SourceProbe {
  if (!snapshot) return { ...probe, status: "available" };
  if (probe.schemaFingerprint && probe.schemaFingerprint !== snapshot.schemaFingerprint) return { ...probe, status: "schema_changed" };
  if ((probe.etag && probe.etag !== snapshot.etag) || (probe.lastModified && probe.lastModified !== snapshot.lastModified)) {
    return { ...probe, status: "changed" };
  }
  return { ...probe, status: "available" };
}

export function shouldSynchronize(mode: "missing" | "stale" | "force", snapshot: SnapshotMetadata | undefined, probe?: SourceProbe): boolean {
  if (mode === "force") return true;
  if (mode === "missing") return snapshot === undefined;
  return snapshot === undefined || probe?.status === "changed";
}
