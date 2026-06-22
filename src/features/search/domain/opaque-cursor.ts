import { createHmac, timingSafeEqual } from "node:crypto";

export type CursorSortValue = string | number | null;

export type SnapshotCursorPayload = {
  snapshotVersion: string;
  offset: number;
  sortKey: readonly CursorSortValue[];
  issuedAt: string;
};

export type EncodeSnapshotCursorOptions = {
  signingKey?: string;
};

export type DecodeSnapshotCursorOptions = {
  expectedSnapshotVersion: string;
  signingKey?: string;
};

export type CursorErrorCode = "INVALID_CURSOR" | "CURSOR_STALE";

export class CursorError extends Error {
  public constructor(
    public readonly code: CursorErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CursorError";
  }
}

const cursorPrefix = "prg1";
const defaultSigningKey = "prg-mcp-snapshot-cursor-v1";

export function encodeSnapshotCursor(
  payload: SnapshotCursorPayload,
  options: EncodeSnapshotCursorOptions = {},
): string {
  validatePayload(payload);
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = signPayload(encodedPayload, options.signingKey);

  return `${cursorPrefix}.${encodedPayload}.${signature}`;
}

export function decodeSnapshotCursor(cursor: string, options: DecodeSnapshotCursorOptions): SnapshotCursorPayload {
  const payload = decodeAndVerifyCursor(cursor, options.signingKey);

  if (payload.snapshotVersion !== options.expectedSnapshotVersion) {
    throw new CursorError(
      "CURSOR_STALE",
      `Cursor belongs to snapshot ${payload.snapshotVersion}, but current snapshot is ${options.expectedSnapshotVersion}.`,
    );
  }

  return payload;
}

function decodeAndVerifyCursor(cursor: string, signingKey?: string): SnapshotCursorPayload {
  const [prefix, encodedPayload, signature, ...extraParts] = cursor.split(".");

  if (prefix !== cursorPrefix || !encodedPayload || !signature || extraParts.length > 0) {
    throw invalidCursor("Cursor format is invalid.");
  }

  if (!signatureMatches(signature, signPayload(encodedPayload, signingKey))) {
    throw invalidCursor("Cursor signature is invalid.");
  }

  return parsePayload(encodedPayload);
}

function parsePayload(encodedPayload: string): SnapshotCursorPayload {
  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as unknown;

    if (!isSnapshotCursorPayload(payload)) {
      throw invalidCursor("Cursor payload shape is invalid.");
    }

    validatePayload(payload);

    return payload;
  } catch (error) {
    if (error instanceof CursorError) {
      throw error;
    }

    throw invalidCursor("Cursor payload is not valid JSON.");
  }
}

function validatePayload(payload: SnapshotCursorPayload): void {
  if (payload.snapshotVersion.length === 0) {
    throw invalidCursor("Cursor snapshot version is empty.");
  }

  if (!Number.isInteger(payload.offset) || payload.offset < 0) {
    throw invalidCursor("Cursor offset must be a non-negative integer.");
  }

  if (Number.isNaN(Date.parse(payload.issuedAt))) {
    throw invalidCursor("Cursor issuedAt must be an ISO date string.");
  }
}

function isSnapshotCursorPayload(payload: unknown): payload is SnapshotCursorPayload {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const candidate = payload as Partial<SnapshotCursorPayload>;

  return (
    typeof candidate.snapshotVersion === "string" &&
    typeof candidate.offset === "number" &&
    typeof candidate.issuedAt === "string" &&
    Array.isArray(candidate.sortKey) &&
    candidate.sortKey.every(isCursorSortValue)
  );
}

function isCursorSortValue(value: unknown): value is CursorSortValue {
  return value === null || typeof value === "string" || typeof value === "number";
}

function signPayload(encodedPayload: string, signingKey = defaultSigningKey): string {
  return createHmac("sha256", signingKey).update(encodedPayload).digest("base64url");
}

function signatureMatches(received: string, expected: string): boolean {
  const receivedBuffer = Buffer.from(received, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  return receivedBuffer.byteLength === expectedBuffer.byteLength && timingSafeEqual(receivedBuffer, expectedBuffer);
}

function invalidCursor(message: string): CursorError {
  return new CursorError("INVALID_CURSOR", message);
}
