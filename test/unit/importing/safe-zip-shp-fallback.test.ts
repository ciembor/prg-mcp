import { Buffer } from "node:buffer";

import { describe, expect, expectTypeOf, it } from "vitest";

import {
  ShpFallbackError,
  ZipSafetyError,
  createShpFallbackManifest,
  readSafeZipEntries,
  type SafeZipEntry,
  type SafeZipReaderOptions,
  type ShpFallbackErrorCode,
  type ShpFallbackManifest,
  type ShpFallbackOptions,
  type ShpFallbackRole,
  type ZipSafetyErrorCode,
} from "../../../src/features/importing/index.js";

describe("safe ZIP reader and SHP fallback adapter", () => {
  it("reads allowed ZIP entries from chunks and exposes uncompressed data", async () => {
    const archive = createStoredZip([
      ["prg/areas.shp", "shape"],
      ["prg/areas.shx", "index"],
      ["prg/areas.dbf", "attributes"],
      ["prg/areas.prj", "EPSG:2180"],
    ]);
    const entries = await readSafeZipEntries(splitBuffer(archive, 17), {
      allowedExtensions: [".shp", ".shx", ".dbf", ".prj"],
      maxEntries: 4,
      maxTotalUncompressedBytes: 100,
    });

    expect(entries.map((entry) => entry.path)).toEqual(["prg/areas.shp", "prg/areas.shx", "prg/areas.dbf", "prg/areas.prj"]);
    expect(Buffer.from(entries[3]?.data ?? []).toString("utf8")).toBe("EPSG:2180");
    expectTypeOf<SafeZipEntry>().toEqualTypeOf<(typeof entries)[number]>();
  });

  it("rejects zip-slip paths before exposing an entry", async () => {
    const archive = createStoredZip([["../evil.shp", "shape"]]);

    await expect(readSafeZipEntries([archive])).rejects.toMatchObject({
      code: "ZIP_UNSAFE_PATH",
      name: "ZipSafetyError",
    });
  });

  it("enforces entry count, extension and compression-ratio limits", async () => {
    const archive = createStoredZip([
      ["one.shp", "1"],
      ["two.shp", "2"],
    ]);
    const unsupported = createStoredZip([["one.exe", "1"]]);
    const zipBomb = createStoredZip([["one.shp", "1"]], {
      declaredUncompressedSize: 1_000,
    });

    await expect(readSafeZipEntries([archive], { maxEntries: 1 })).rejects.toMatchObject({
      code: "ZIP_TOO_MANY_ENTRIES",
    });
    await expect(readSafeZipEntries([unsupported], { allowedExtensions: [".shp"] })).rejects.toMatchObject({
      code: "ZIP_EXTENSION_NOT_ALLOWED",
    });
    await expect(readSafeZipEntries([zipBomb], { maxCompressionRatio: 10 })).rejects.toMatchObject({
      code: "ZIP_COMPRESSION_RATIO",
    });
    expectTypeOf<SafeZipReaderOptions>().toMatchTypeOf<{
      maxEntries?: number;
    }>();
    expectTypeOf<ZipSafetyErrorCode>().toMatchTypeOf<string>();
    expect(new ZipSafetyError("ZIP_INVALID", "invalid").code).toBe("ZIP_INVALID");
  });

  it("creates a controlled SHP fallback manifest for complete known datasets", async () => {
    const entries = await readSafeZipEntries([createStoredZip([
      ["PRG_A03_wojewodztwa.shp", "shape"],
      ["PRG_A03_wojewodztwa.shx", "index"],
      ["PRG_A03_wojewodztwa.dbf", "attributes"],
      ["PRG_A03_wojewodztwa.prj", "EPSG:2180"],
      ["PRG_A03_wojewodztwa.cpg", "UTF-8"],
    ])], {
      allowedExtensions: [".shp", ".shx", ".dbf", ".prj", ".cpg"],
    });
    const manifest = createShpFallbackManifest(entries, {
      allowedSchemaFingerprints: ["sha256:known-prg-shp"],
      fallbackAllowed: true,
      schemaFingerprint: "sha256:known-prg-shp",
    });

    expect(manifest).toEqual({
      datasets: [
        {
          baseName: "PRG_A03_wojewodztwa",
          files: {
            attributes: "PRG_A03_wojewodztwa.dbf",
            encoding: "PRG_A03_wojewodztwa.cpg",
            index: "PRG_A03_wojewodztwa.shx",
            projection: "PRG_A03_wojewodztwa.prj",
            shape: "PRG_A03_wojewodztwa.shp",
          },
        },
      ],
      format: "shp-fallback",
      schemaFingerprint: "sha256:known-prg-shp",
    });
    expectTypeOf(manifest).toEqualTypeOf<ShpFallbackManifest>();
    expectTypeOf<ShpFallbackRole>().toMatchTypeOf<string>();
    expectTypeOf<ShpFallbackOptions>().toMatchTypeOf<{
      fallbackAllowed: boolean;
    }>();
    expectTypeOf<ShpFallbackErrorCode>().toMatchTypeOf<string>();
  });

  it("keeps SHP fallback disabled unless explicitly allowed and complete", () => {
    const entries = [
      { path: "areas.shp" },
      { path: "areas.shx" },
      { path: "areas.dbf" },
      { path: "areas.prj" },
    ];

    expect(() =>
      createShpFallbackManifest(entries, {
        allowedSchemaFingerprints: ["sha256:known-prg-shp"],
        fallbackAllowed: false,
        schemaFingerprint: "sha256:known-prg-shp",
      }),
    ).toThrow(ShpFallbackError);
    expect(() =>
      createShpFallbackManifest(entries, {
        allowedSchemaFingerprints: ["sha256:known-prg-shp"],
        fallbackAllowed: true,
        schemaFingerprint: "sha256:unknown",
      }),
    ).toThrow(ShpFallbackError);
    let incompleteDatasetError: unknown;

    try {
      createShpFallbackManifest(entries.slice(0, 3), {
        allowedSchemaFingerprints: ["sha256:known-prg-shp"],
        fallbackAllowed: true,
        schemaFingerprint: "sha256:known-prg-shp",
      });
    } catch (error) {
      incompleteDatasetError = error;
    }

    expect(incompleteDatasetError).toMatchObject({
      code: "SHP_INCOMPLETE_DATASET",
    });
  });
});

type StoredZipOptions = {
  declaredUncompressedSize?: number;
};

function createStoredZip(entries: readonly (readonly [string, string])[], options: StoredZipOptions = {}): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const [path, content] of entries) {
    const name = Buffer.from(path, "utf8");
    const data = Buffer.from(content, "utf8");
    const uncompressedSize = options.declaredUncompressedSize ?? data.byteLength;
    const localHeader = createLocalHeader(name, data.byteLength, uncompressedSize);
    const centralHeader = createCentralHeader(name, data.byteLength, uncompressedSize, offset);

    localParts.push(localHeader, data);
    centralParts.push(centralHeader);
    offset += localHeader.byteLength + data.byteLength;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = createEndOfCentralDirectory(entries.length, centralDirectory.byteLength, offset);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

function createLocalHeader(name: Buffer, compressedSize: number, uncompressedSize: number): Buffer {
  const header = Buffer.alloc(30 + name.byteLength);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt32LE(0, 10);
  header.writeUInt32LE(0, 14);
  header.writeUInt32LE(compressedSize, 18);
  header.writeUInt32LE(uncompressedSize, 22);
  header.writeUInt16LE(name.byteLength, 26);
  name.copy(header, 30);

  return header;
}

function createCentralHeader(name: Buffer, compressedSize: number, uncompressedSize: number, localHeaderOffset: number): Buffer {
  const header = Buffer.alloc(46 + name.byteLength);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt32LE(0, 12);
  header.writeUInt32LE(0, 16);
  header.writeUInt32LE(compressedSize, 20);
  header.writeUInt32LE(uncompressedSize, 24);
  header.writeUInt16LE(name.byteLength, 28);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(localHeaderOffset, 42);
  name.copy(header, 46);

  return header;
}

function createEndOfCentralDirectory(entryCount: number, centralDirectorySize: number, centralDirectoryOffset: number): Buffer {
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entryCount, 8);
  end.writeUInt16LE(entryCount, 10);
  end.writeUInt32LE(centralDirectorySize, 12);
  end.writeUInt32LE(centralDirectoryOffset, 16);

  return end;
}

function splitBuffer(buffer: Buffer, chunkSize: number): Uint8Array[] {
  const chunks: Uint8Array[] = [];

  for (let offset = 0; offset < buffer.byteLength; offset += chunkSize) {
    chunks.push(buffer.subarray(offset, offset + chunkSize));
  }

  return chunks;
}
