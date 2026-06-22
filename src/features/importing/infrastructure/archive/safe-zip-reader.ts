import { inflateRawSync } from "node:zlib";

export type SafeZipReaderOptions = {
  maxArchiveBytes?: number;
  maxEntries?: number;
  maxTotalUncompressedBytes?: number;
  maxCompressionRatio?: number;
  allowedExtensions?: readonly string[];
};

export type SafeZipEntry = {
  path: string;
  compressedSize: number;
  uncompressedSize: number;
  compressionMethod: "stored" | "deflate";
  data: Uint8Array;
};

export type ZipSafetyErrorCode =
  | "ZIP_TOO_LARGE"
  | "ZIP_INVALID"
  | "ZIP_TOO_MANY_ENTRIES"
  | "ZIP_UNSAFE_PATH"
  | "ZIP_EXTENSION_NOT_ALLOWED"
  | "ZIP_ENTRY_TOO_LARGE"
  | "ZIP_COMPRESSION_RATIO"
  | "ZIP_UNSUPPORTED_METHOD";

export class ZipSafetyError extends Error {
  public constructor(
    public readonly code: ZipSafetyErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ZipSafetyError";
  }
}

type CentralDirectoryEntry = {
  path: string;
  flags: number;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
};

type ZipLimits = Required<Omit<SafeZipReaderOptions, "allowedExtensions">> & {
  allowedExtensions?: readonly string[];
};

const endOfCentralDirectorySignature = 0x06054b50;
const centralDirectorySignature = 0x02014b50;
const localFileHeaderSignature = 0x04034b50;
const storedMethod = 0;
const deflateMethod = 8;

export async function readSafeZipEntries(
  chunks: AsyncIterable<Uint8Array> | Iterable<Uint8Array>,
  options: SafeZipReaderOptions = {},
): Promise<SafeZipEntry[]> {
  const limits = toZipLimits(options);
  const archive = await readArchiveBytes(chunks, limits.maxArchiveBytes);
  const centralDirectory = parseCentralDirectory(archive, limits);

  validateCentralDirectory(centralDirectory, limits);

  return centralDirectory.map((entry) => readLocalEntry(archive, entry));
}

function toZipLimits(options: SafeZipReaderOptions): ZipLimits {
  return {
    allowedExtensions: options.allowedExtensions?.map((extension) => extension.toLowerCase()),
    maxArchiveBytes: options.maxArchiveBytes ?? 100 * 1024 * 1024,
    maxCompressionRatio: options.maxCompressionRatio ?? 100,
    maxEntries: options.maxEntries ?? 2048,
    maxTotalUncompressedBytes: options.maxTotalUncompressedBytes ?? 2 * 1024 * 1024 * 1024,
  };
}

async function readArchiveBytes(
  chunks: AsyncIterable<Uint8Array> | Iterable<Uint8Array>,
  maxArchiveBytes: number,
): Promise<Buffer> {
  const buffers: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of chunks) {
    totalBytes += chunk.byteLength;

    if (totalBytes > maxArchiveBytes) {
      throw new ZipSafetyError("ZIP_TOO_LARGE", `ZIP archive exceeds ${maxArchiveBytes} bytes.`);
    }

    buffers.push(Buffer.from(chunk));
  }

  return Buffer.concat(buffers, totalBytes);
}

function parseCentralDirectory(archive: Buffer, limits: ZipLimits): CentralDirectoryEntry[] {
  const endOffset = findEndOfCentralDirectory(archive);
  const entryCount = archive.readUInt16LE(endOffset + 10);
  const centralDirectorySize = archive.readUInt32LE(endOffset + 12);
  const centralDirectoryOffset = archive.readUInt32LE(endOffset + 16);
  const diskNumber = archive.readUInt16LE(endOffset + 4);
  const centralDirectoryDisk = archive.readUInt16LE(endOffset + 6);

  if (diskNumber !== 0 || centralDirectoryDisk !== 0) {
    throw new ZipSafetyError("ZIP_INVALID", "Multi-disk ZIP archives are not supported.");
  }

  if (entryCount > limits.maxEntries) {
    throw new ZipSafetyError("ZIP_TOO_MANY_ENTRIES", `ZIP archive has ${entryCount} entries.`);
  }

  if (centralDirectoryOffset + centralDirectorySize > archive.length) {
    throw new ZipSafetyError("ZIP_INVALID", "ZIP central directory points outside archive bounds.");
  }

  const entries: CentralDirectoryEntry[] = [];
  let offset = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    const entry = readCentralDirectoryEntry(archive, offset);
    entries.push(entry);
    offset += centralDirectoryEntryLength(archive, offset);
  }

  return entries;
}

function findEndOfCentralDirectory(archive: Buffer): number {
  const minimumSize = 22;
  const maxCommentLength = 65_535;
  const searchStart = Math.max(0, archive.length - minimumSize - maxCommentLength);

  for (let offset = archive.length - minimumSize; offset >= searchStart; offset -= 1) {
    if (archive.readUInt32LE(offset) === endOfCentralDirectorySignature) {
      return offset;
    }
  }

  throw new ZipSafetyError("ZIP_INVALID", "ZIP end of central directory was not found.");
}

function readCentralDirectoryEntry(archive: Buffer, offset: number): CentralDirectoryEntry {
  assertSignature(archive, offset, centralDirectorySignature, "central directory");

  const fileNameLength = archive.readUInt16LE(offset + 28);
  const extraLength = archive.readUInt16LE(offset + 30);
  const commentLength = archive.readUInt16LE(offset + 32);
  const rawPath = archive.subarray(offset + 46, offset + 46 + fileNameLength).toString("utf8");

  assertBounds(archive, offset + 46, fileNameLength + extraLength + commentLength, "central directory entry");

  return {
    compressedSize: archive.readUInt32LE(offset + 20),
    compressionMethod: archive.readUInt16LE(offset + 10),
    flags: archive.readUInt16LE(offset + 8),
    localHeaderOffset: archive.readUInt32LE(offset + 42),
    path: normalizeZipPath(rawPath),
    uncompressedSize: archive.readUInt32LE(offset + 24),
  };
}

function centralDirectoryEntryLength(archive: Buffer, offset: number): number {
  assertSignature(archive, offset, centralDirectorySignature, "central directory");

  return 46 + archive.readUInt16LE(offset + 28) + archive.readUInt16LE(offset + 30) + archive.readUInt16LE(offset + 32);
}

function validateCentralDirectory(entries: readonly CentralDirectoryEntry[], limits: ZipLimits): void {
  let totalUncompressedBytes = 0;

  for (const entry of entries) {
    validateEntry(entry, limits);
    totalUncompressedBytes += entry.uncompressedSize;

    if (totalUncompressedBytes > limits.maxTotalUncompressedBytes) {
      throw new ZipSafetyError("ZIP_ENTRY_TOO_LARGE", `ZIP uncompressed payload exceeds ${limits.maxTotalUncompressedBytes} bytes.`);
    }
  }
}

function validateEntry(entry: CentralDirectoryEntry, limits: ZipLimits): void {
  if ((entry.flags & 1) === 1) {
    throw new ZipSafetyError("ZIP_UNSUPPORTED_METHOD", `Encrypted ZIP entry is not supported: ${entry.path}`);
  }

  if (entry.compressionMethod !== storedMethod && entry.compressionMethod !== deflateMethod) {
    throw new ZipSafetyError("ZIP_UNSUPPORTED_METHOD", `Unsupported ZIP compression method ${entry.compressionMethod}: ${entry.path}`);
  }

  if (entry.uncompressedSize > 0 && entry.compressedSize === 0) {
    throw new ZipSafetyError("ZIP_COMPRESSION_RATIO", `ZIP entry has zero compressed size and non-empty output: ${entry.path}`);
  }

  if (entry.compressedSize > 0 && entry.uncompressedSize / entry.compressedSize > limits.maxCompressionRatio) {
    throw new ZipSafetyError("ZIP_COMPRESSION_RATIO", `ZIP entry exceeds compression ratio limit: ${entry.path}`);
  }

  if (limits.allowedExtensions && !limits.allowedExtensions.includes(getZipExtension(entry.path))) {
    throw new ZipSafetyError("ZIP_EXTENSION_NOT_ALLOWED", `ZIP entry extension is not allowed: ${entry.path}`);
  }
}

function readLocalEntry(archive: Buffer, entry: CentralDirectoryEntry): SafeZipEntry {
  assertSignature(archive, entry.localHeaderOffset, localFileHeaderSignature, "local file header");

  const fileNameLength = archive.readUInt16LE(entry.localHeaderOffset + 26);
  const extraLength = archive.readUInt16LE(entry.localHeaderOffset + 28);
  const payloadOffset = entry.localHeaderOffset + 30 + fileNameLength + extraLength;
  assertBounds(archive, payloadOffset, entry.compressedSize, entry.path);

  const compressed = archive.subarray(payloadOffset, payloadOffset + entry.compressedSize);
  const data = decompressEntry(entry, compressed);

  if (data.byteLength !== entry.uncompressedSize) {
    throw new ZipSafetyError("ZIP_INVALID", `ZIP entry size mismatch: ${entry.path}`);
  }

  return {
    compressedSize: entry.compressedSize,
    compressionMethod: entry.compressionMethod === storedMethod ? "stored" : "deflate",
    data,
    path: entry.path,
    uncompressedSize: entry.uncompressedSize,
  };
}

function decompressEntry(entry: CentralDirectoryEntry, compressed: Buffer): Uint8Array {
  if (entry.compressionMethod === storedMethod) {
    return Uint8Array.from(compressed);
  }

  return Uint8Array.from(inflateRawSync(compressed));
}

function normalizeZipPath(rawPath: string): string {
  const path = rawPath.replaceAll("\\", "/");

  if (
    path.length === 0 ||
    path.startsWith("/") ||
    path.includes("\0") ||
    /^[a-z]:/iu.test(path) ||
    path.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new ZipSafetyError("ZIP_UNSAFE_PATH", `Unsafe ZIP entry path: ${rawPath}`);
  }

  return path;
}

function getZipExtension(path: string): string {
  const fileName = path.split("/").at(-1) ?? "";
  const extensionOffset = fileName.lastIndexOf(".");

  return extensionOffset === -1 ? "" : fileName.slice(extensionOffset).toLowerCase();
}

function assertSignature(archive: Buffer, offset: number, expected: number, label: string): void {
  assertBounds(archive, offset, 4, label);

  if (archive.readUInt32LE(offset) !== expected) {
    throw new ZipSafetyError("ZIP_INVALID", `Invalid ZIP ${label} signature.`);
  }
}

function assertBounds(archive: Buffer, offset: number, size: number, label: string): void {
  if (offset < 0 || size < 0 || offset + size > archive.length) {
    throw new ZipSafetyError("ZIP_INVALID", `ZIP ${label} points outside archive bounds.`);
  }
}
