import { describe, expect, it } from "vitest";

import { createAddressPackageSyncSource, createPagedWfsSyncSource, partitionAddressRecordsByVoivodeship, type SyncRecord } from "../../../src/features/synchronization/index.js";

const record = (objectId: string, municipalityCode?: string): SyncRecord => ({
  bbox: [100_000, 100_000, 100_000, 100_000], crs: "EPSG:2180", municipalityCode, objectId, recordType: "address",
});

describe("paged synchronization sources", () => {
  it("deduplicates overlapping WFS pages and validates numberMatched", async () => {
    const source = createPagedWfsSyncSource({
      adapterVersion: "1", schemaFingerprint: "schema", sourceUrl: "https://example.test/wfs",
      probe: async () => ({ checkedAt: "2026-06-23T00:00:00.000Z", sourceUrl: "https://example.test/wfs", status: "available" }),
      pages: async function* () {
        yield { bytes: new Uint8Array([1]), next: true, numberMatched: 2, records: [record("a"), record("b")] };
        yield { bytes: new Uint8Array([2]), next: false, numberMatched: 2, records: [record("b")] };
      },
    });
    const downloaded = await source.download({} as never);
    expect(downloaded.records.map(({ objectId }) => objectId)).toEqual(["a", "b"]);
    expect(downloaded.bytes).toEqual(new Uint8Array([1, 2]));
  });

  it("partitions national address packages into voivodeship shards", () => {
    const shards = partitionAddressRecordsByVoivodeship([record("a", "1465011"), record("b", "0201011")]);
    expect([...shards.keys()]).toEqual(["14", "02"]);
    expect(shards.get("14")?.[0]?.objectId).toBe("a");
  });

  it("keeps address package discovery separate from payload download", async () => {
    const source = createAddressPackageSyncSource({
      fetchPackage: async () => ({ adapterVersion: "1", bytes: new Uint8Array(), records: [], schemaFingerprint: "schema", sourceUrl: "https://example.test/address.zip" }),
      probe: async () => ({ checkedAt: "2026-06-23T00:00:00.000Z", sourceUrl: "https://example.test/address.zip", status: "available" }),
    });
    expect((await source.download({} as never)).adapterVersion).toBe("1");
  });
});
