import type { DownloadedSyncDataset, SyncSource } from "../../application/run-sync.js";
import type { SourceProbe, SyncTarget } from "../../domain/sync-model.js";
import type { SyncRecord } from "../../domain/sync-validation.js";

export type SyncPage = {
  readonly bytes: Uint8Array;
  readonly records: readonly SyncRecord[];
  readonly numberMatched: number | "unknown";
  readonly next: boolean;
};

export type PagedWfsSourceOptions = {
  readonly probe: SyncSource["probe"];
  readonly pages: (target: SyncTarget) => AsyncIterable<SyncPage>;
  readonly sourceUrl: string;
  readonly schemaFingerprint: string;
  readonly adapterVersion: string;
  readonly stateDate?: () => string | undefined;
};

export function createPagedWfsSyncSource(options: PagedWfsSourceOptions): SyncSource {
  return {
    probe: options.probe,
    download: async (target) => {
      const records = new Map<string, SyncRecord>();
      const chunks: Uint8Array[] = [];
      let expectedCount: number | "unknown" = "unknown";
      for await (const page of options.pages(target)) {
        chunks.push(page.bytes);
        expectedCount = page.numberMatched;
        for (const record of page.records) records.set(record.objectId, record);
      }
      if (expectedCount !== "unknown" && records.size !== expectedCount) {
        throw new Error(`WFS coverage mismatch: expected ${expectedCount}, received ${records.size} unique records.`);
      }
      return dataset([...records.values()], concatBytes(chunks), options);
    },
  };
}

export type AddressPackage = {
  readonly bytes: Uint8Array;
  readonly records: readonly SyncRecord[];
  readonly sourceUrl: string;
  readonly stateDate?: string;
  readonly etag?: string;
  readonly lastModified?: string;
  readonly schemaFingerprint: string;
  readonly adapterVersion: string;
};

export type AddressPackageSourceOptions = {
  readonly probe: (target: SyncTarget, conditional?: { readonly etag?: string; readonly lastModified?: string }) => Promise<SourceProbe>;
  readonly fetchPackage: (target: SyncTarget) => Promise<AddressPackage>;
};

export function createAddressPackageSyncSource(options: AddressPackageSourceOptions): SyncSource {
  return { probe: options.probe, download: async (target) => options.fetchPackage(target) };
}

export function partitionAddressRecordsByVoivodeship(records: readonly SyncRecord[]): ReadonlyMap<string, readonly SyncRecord[]> {
  const shards = new Map<string, SyncRecord[]>();
  for (const record of records) {
    const shard = record.municipalityCode?.slice(0, 2);
    if (!shard || !/^\d{2}$/u.test(shard)) throw new Error(`Address ${record.objectId} has no valid municipality code for sharding.`);
    const existing = shards.get(shard) ?? [];
    existing.push(record);
    shards.set(shard, existing);
  }
  return shards;
}

function dataset(records: readonly SyncRecord[], bytes: Uint8Array, options: PagedWfsSourceOptions): DownloadedSyncDataset {
  return {
    adapterVersion: options.adapterVersion,
    bytes,
    records,
    schemaFingerprint: options.schemaFingerprint,
    sourceUrl: options.sourceUrl,
    stateDate: options.stateDate?.(),
  };
}

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const combined = new Uint8Array(chunks.reduce((length, chunk) => length + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.length; }
  return combined;
}
