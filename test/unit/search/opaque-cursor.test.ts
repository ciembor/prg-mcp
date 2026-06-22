import { describe, expect, expectTypeOf, it } from "vitest";

import {
  CursorError,
  decodeSnapshotCursor,
  encodeSnapshotCursor,
  type CursorErrorCode,
  type CursorSortValue,
  type DecodeSnapshotCursorOptions,
  type EncodeSnapshotCursorOptions,
  type SnapshotCursorPayload,
} from "../../../src/features/search/index.js";

describe("snapshot-bound opaque cursor", () => {
  const payload: SnapshotCursorPayload = {
    issuedAt: "2026-06-22T20:00:00.000Z",
    offset: 25,
    snapshotVersion: "boundaries:2026-06-22:a03",
    sortKey: ["Wieliszew", "object-1", 42],
  };

  it("encodes and decodes an opaque cursor for the same snapshot version", () => {
    const cursor = encodeSnapshotCursor(payload, {
      signingKey: "test-key",
    });

    expect(cursor).toMatch(/^prg1\.[^.]+\.[^.]+$/u);
    expect(cursor).not.toContain("Wieliszew");
    expect(decodeSnapshotCursor(cursor, {
      expectedSnapshotVersion: payload.snapshotVersion,
      signingKey: "test-key",
    })).toEqual(payload);
  });

  it("invalidates a cursor when the snapshot version changes", () => {
    const cursor = encodeSnapshotCursor(payload);

    expect(() =>
      decodeSnapshotCursor(cursor, {
        expectedSnapshotVersion: "boundaries:2026-06-23:a03",
      }),
    ).toThrow(CursorError);
    expect(() =>
      decodeSnapshotCursor(cursor, {
        expectedSnapshotVersion: "boundaries:2026-06-23:a03",
      }),
    ).toThrow(/current snapshot is boundaries:2026-06-23:a03/u);
  });

  it("rejects tampered and malformed cursors with INVALID_CURSOR", () => {
    const cursor = encodeSnapshotCursor(payload);
    const tampered = cursor.replace("prg1.", "prg1.x");

    expect(readCursorErrorCode(tampered)).toBe("INVALID_CURSOR");
    expect(readCursorErrorCode("not-a-cursor")).toBe("INVALID_CURSOR");
    expect(() =>
      encodeSnapshotCursor({
        ...payload,
        offset: -1,
      }),
    ).toThrow(CursorError);
  });

  it("keeps cursor API types explicit", () => {
    expectTypeOf<CursorSortValue>().toEqualTypeOf<string | number | null>();
    expectTypeOf<CursorErrorCode>().toMatchTypeOf<string>();
    expectTypeOf<EncodeSnapshotCursorOptions>().toMatchTypeOf<{
      signingKey?: string;
    }>();
    expectTypeOf<DecodeSnapshotCursorOptions>().toMatchTypeOf<{
      expectedSnapshotVersion: string;
    }>();
  });
});

function readCursorErrorCode(cursor: string): CursorErrorCode {
  try {
    decodeSnapshotCursor(cursor, {
      expectedSnapshotVersion: "boundaries:2026-06-22:a03",
    });
  } catch (error) {
    if (error instanceof CursorError) {
      return error.code;
    }
  }

  throw new Error("Expected cursor decode to fail.");
}
