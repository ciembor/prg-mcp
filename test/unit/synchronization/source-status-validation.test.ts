import { describe, expect, it } from "vitest";

import {
  classifySourceProbe,
  isFresh,
  shouldSynchronize,
  SyncValidationError,
  validateSyncDataset,
  type SnapshotMetadata,
  type SyncRecord,
} from "../../../src/features/synchronization/index.js";

const snapshot: SnapshotMetadata = {
  adapterVersion: "1", checkedAt: "2026-06-23T00:00:00.000Z", datasetKey: "current:A00",
  downloadedAt: "2026-06-23T00:00:00.000Z", etag: "old", recordCount: 1, schemaFingerprint: "schema-1",
  scope: "country:PL", sha256: "abc", sourceUrl: "https://example.test/a00", stateDate: "2026-06-22",
};

describe("source freshness and validation", () => {
  it("classifies changed metadata without downloading payloads", () => {
    const changed = classifySourceProbe(snapshot, { checkedAt: "2026-06-23T01:00:00.000Z", etag: "new", sourceUrl: snapshot.sourceUrl });
    const schemaChanged = classifySourceProbe(snapshot, { checkedAt: changed.checkedAt, schemaFingerprint: "schema-2", sourceUrl: snapshot.sourceUrl });
    expect(changed.status).toBe("changed");
    expect(schemaChanged.status).toBe("schema_changed");
    expect(shouldSynchronize("stale", snapshot, changed)).toBe(true);
    expect(shouldSynchronize("missing", snapshot, changed)).toBe(false);
    expect(isFresh(snapshot, new Date("2026-06-23T23:59:00.000Z"))).toBe(true);
  });

  it("validates IDs, CRS, bbox and manifest count", () => {
    const record: SyncRecord = { bbox: [100_000, 100_000, 200_000, 200_000], crs: "EPSG:2180", objectId: "one", recordType: "area" };
    expect(() => validateSyncDataset({ metadata: snapshot, records: [record], target: {} as never })).not.toThrow();
    expect(() => validateSyncDataset({ metadata: { ...snapshot, recordCount: 2 }, records: [record, record], target: {} as never })).toThrowError(
      expect.objectContaining({ code: "DUPLICATE_ID" }),
    );
    try {
      validateSyncDataset({ metadata: { ...snapshot, recordCount: 2 }, records: [record, record], target: {} as never });
    } catch (error) {
      expect(error).toBeInstanceOf(SyncValidationError);
    }
  });
});
