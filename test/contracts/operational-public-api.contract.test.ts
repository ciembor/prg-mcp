import { describe, expect, expectTypeOf, it } from "vitest";

import type { AboutResult } from "../../src/features/about/index.js";
import type { ListedLayer } from "../../src/features/list-layers/index.js";
import type { DatabaseFileStatus, ServerStatus } from "../../src/features/server-status/index.js";
import type { CoverageStatus, SourceStatusResult } from "../../src/features/source-status/index.js";
import {
  syncDataErrorCodes,
  SyncDataToolError,
  type SyncDataErrorCode,
  type SyncDataInput,
  type SyncDataResult,
} from "../../src/features/sync-data/index.js";

describe("operational feature public APIs", () => {
  it("keeps operational contracts explicit", () => {
    expectTypeOf<AboutResult>().toHaveProperty("databaseSchemaVersion").toEqualTypeOf<number>();
    expectTypeOf<ListedLayer>().toHaveProperty("installedScopes").toEqualTypeOf<readonly string[]>();
    expectTypeOf<DatabaseFileStatus>().toHaveProperty("sizeBytes").toEqualTypeOf<number>();
    expectTypeOf<ServerStatus>().toHaveProperty("databases").toEqualTypeOf<readonly DatabaseFileStatus[]>();
    expectTypeOf<CoverageStatus>().toHaveProperty("layerId").toEqualTypeOf<string>();
    expectTypeOf<SourceStatusResult>().toHaveProperty("coverage").toEqualTypeOf<readonly CoverageStatus[]>();
    expectTypeOf<SyncDataInput>().toHaveProperty("mode").toEqualTypeOf<"missing" | "stale" | "force">();
    expectTypeOf<SyncDataResult>().toHaveProperty("run").toBeObject();
    expectTypeOf<SyncDataErrorCode>().toEqualTypeOf<(typeof syncDataErrorCodes)[number]>();
    expect(syncDataErrorCodes).toHaveLength(5);
    expect(new SyncDataToolError("test", "SYNC_LOCKED").code).toBe("SYNC_LOCKED");
  });
});
