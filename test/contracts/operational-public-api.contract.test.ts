import { describe, expectTypeOf, it } from "vitest";

import type { AboutResult } from "../../src/features/about/index.js";
import type { ListedLayer } from "../../src/features/list-layers/index.js";
import type { DatabaseFileStatus, ServerStatus } from "../../src/features/server-status/index.js";
import type { CoverageStatus, SourceStatusResult } from "../../src/features/source-status/index.js";

describe("operational feature public APIs", () => {
  it("keeps operational contracts explicit", () => {
    expectTypeOf<AboutResult>().toHaveProperty("databaseSchemaVersion").toEqualTypeOf<number>();
    expectTypeOf<ListedLayer>().toHaveProperty("installedScopes").toEqualTypeOf<readonly string[]>();
    expectTypeOf<DatabaseFileStatus>().toHaveProperty("sizeBytes").toEqualTypeOf<number>();
    expectTypeOf<ServerStatus>().toHaveProperty("databases").toEqualTypeOf<readonly DatabaseFileStatus[]>();
    expectTypeOf<CoverageStatus>().toHaveProperty("layerId").toEqualTypeOf<string>();
    expectTypeOf<SourceStatusResult>().toHaveProperty("coverage").toEqualTypeOf<readonly CoverageStatus[]>();
  });
});
