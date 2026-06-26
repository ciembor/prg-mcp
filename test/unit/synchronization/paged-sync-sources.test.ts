import { describe, expect, it } from "vitest";

import { createAddressPackageSyncSource, createPagedWfsSyncSource, partitionAddressRecordsByVoivodeship, type SyncRecord } from "../../../src/features/synchronization/index.js";

const record = (objectId: string, municipalityCode?: string): SyncRecord => ({
  bbox: [100_000, 100_000, 100_000, 100_000], crs: "EPSG:2180", municipalityCode, objectId, recordType: "address",
});
const street = (objectId: string, municipalityCode?: string): SyncRecord => ({
  bbox: [100_000, 100_000, 100_000, 100_000], crs: "EPSG:2180", municipalityCode, objectId, recordType: "street",
});

describe("paged synchronization sources", () => {
  it("preserves overlapping WFS page records so validation can detect duplicates", async () => {
    const source = createPagedWfsSyncSource({
      adapterVersion: "1", schemaFingerprint: "schema", sourceUrl: "https://example.test/wfs",
      probe: async () => ({ checkedAt: "2026-06-23T00:00:00.000Z", sourceUrl: "https://example.test/wfs", status: "available" }),
      pages: async function* () {
        yield { bytes: new Uint8Array([1]), next: true, numberMatched: 3, records: [record("a"), record("b")] };
        yield { bytes: new Uint8Array([2]), next: false, numberMatched: 3, records: [record("b")] };
      },
    });
    const downloaded = await source.download({} as never);
    expect(downloaded.records.map(({ objectId }) => objectId)).toEqual(["a", "b", "b"]);
    expect(downloaded.bytes).toEqual(new Uint8Array([1, 2]));
  });

  it("rejects inconsistent or excessive WFS page counts", async () => {
    const inconsistent = createPagedWfsSyncSource({
      adapterVersion: "1", schemaFingerprint: "schema", sourceUrl: "https://example.test/wfs",
      probe: async () => ({ checkedAt: "2026-06-23T00:00:00.000Z", sourceUrl: "https://example.test/wfs", status: "available" }),
      pages: async function* () {
        yield { bytes: new Uint8Array([1]), next: true, numberMatched: 2, records: [record("a")] };
        yield { bytes: new Uint8Array([2]), next: false, numberMatched: 3, records: [record("b")] };
      },
    });
    await expect(inconsistent.download({} as never)).rejects.toThrow("numberMatched changed");

    const excessive = createPagedWfsSyncSource({
      adapterVersion: "1", schemaFingerprint: "schema", sourceUrl: "https://example.test/wfs",
      probe: async () => ({ checkedAt: "2026-06-23T00:00:00.000Z", sourceUrl: "https://example.test/wfs", status: "available" }),
      pages: async function* () {
        yield { bytes: new Uint8Array([1]), next: false, numberMatched: 1, records: [record("a"), record("b")] };
      },
    });
    await expect(excessive.download({} as never)).rejects.toThrow("WFS coverage mismatch");
  });

  it("partitions national address packages into voivodeship shards", () => {
    const shards = partitionAddressRecordsByVoivodeship([record("a", "1465011"), record("b", "0201011")]);
    expect([...shards.keys()]).toEqual(["14", "02"]);
    expect(shards.get("14")?.[0]?.objectId).toBe("a");
    expect(() => partitionAddressRecordsByVoivodeship([record("bad", "9901011")])).toThrow("no valid municipality code");
  });

  it("partitions street records without municipality code through referencing addresses", () => {
    const shards = partitionAddressRecordsByVoivodeship([
      { ...record("a", "1465011"), streetId: "street-shared" },
      { ...record("b", "0201011"), streetId: "street-shared" },
      street("street-shared"),
    ]);

    expect(shards.get("14")?.map(({ objectId }) => objectId)).toEqual(["a", "street-shared"]);
    expect(shards.get("02")?.map(({ objectId }) => objectId)).toEqual(["b", "street-shared"]);
    expect(() => partitionAddressRecordsByVoivodeship([street("orphan")])).toThrow("Street orphan has no valid municipality code");
  });

  it("keeps address package discovery separate from payload download", async () => {
    const source = createAddressPackageSyncSource({
      fetchPackage: async () => ({ adapterVersion: "1", bytes: new Uint8Array(), records: [], schemaFingerprint: "schema", sourceUrl: "https://example.test/address.zip" }),
      probe: async () => ({ checkedAt: "2026-06-23T00:00:00.000Z", sourceUrl: "https://example.test/address.zip", status: "available" }),
    });
    expect((await source.download({} as never)).adapterVersion).toBe("1");
  });
});
