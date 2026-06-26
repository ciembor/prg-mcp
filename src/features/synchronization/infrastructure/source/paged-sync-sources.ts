import type { DownloadedSyncDataset, SyncSource } from "../../application/run-sync.js";
import type { SourceProbe, SyncTarget } from "../../domain/sync-model.js";
import type { SyncRecord } from "../../domain/sync-validation.js";
import { prgVoivodeshipCodes } from "../../../persistence/index.js";

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
      const records: SyncRecord[] = [];
      const chunks: Uint8Array[] = [];
      let expectedCount: number | "unknown" = "unknown";
      for await (const page of options.pages(target)) {
        chunks.push(page.bytes);
        expectedCount = mergeExpectedCount(expectedCount, page.numberMatched);
        records.push(...page.records);
      }
      if (expectedCount !== "unknown" && records.length !== expectedCount) {
        throw new Error(`WFS coverage mismatch: expected ${expectedCount}, received ${records.length} records.`);
      }
      return dataset(records, concatBytes(chunks), options);
    },
  };
}

function mergeExpectedCount(current: number | "unknown", next: number | "unknown"): number | "unknown" {
  if (next === "unknown") {
    return current;
  }

  if (current !== "unknown" && current !== next) {
    throw new Error(`WFS numberMatched changed between pages: ${current} vs ${next}.`);
  }

  return next;
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
  const streetShardHints = streetShardHintsByObjectId(records);
  for (const record of records) {
    const explicitShard = shardFromMunicipalityCode(record.municipalityCode);
    const recordShards = explicitShard ? [explicitShard] : [...(streetShardHints.get(record.objectId) ?? [])];

    if (recordShards.length === 0) {
      const label = record.recordType === "street" ? "Street" : "Address";
      throw new Error(`${label} ${record.objectId} has no valid municipality code for sharding.`);
    }

    for (const shard of recordShards) {
      const existing = shards.get(shard) ?? [];
      existing.push(record);
      shards.set(shard, existing);
    }
  }
  return shards;
}

function streetShardHintsByObjectId(records: readonly SyncRecord[]): ReadonlyMap<string, ReadonlySet<string>> {
  const hints = new Map<string, Set<string>>();

  for (const record of records) {
    if (record.recordType !== "address" || !record.streetId) {
      continue;
    }

    const shard = shardFromMunicipalityCode(record.municipalityCode);
    if (!shard) {
      continue;
    }

    const existing = hints.get(record.streetId) ?? new Set<string>();
    existing.add(shard);
    hints.set(record.streetId, existing);
  }

  return hints;
}

function shardFromMunicipalityCode(municipalityCode: string | undefined): string | undefined {
  const shard = municipalityCode?.slice(0, 2);
  return shard && prgVoivodeshipCodes.includes(shard as never) ? shard : undefined;
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
