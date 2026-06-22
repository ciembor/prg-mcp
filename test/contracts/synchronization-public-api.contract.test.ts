import { describe, expectTypeOf, it } from "vitest";

import type {
  AddressPackage,
  AddressPackageSourceOptions,
  PagedWfsSourceOptions,
  PlanSyncInput,
  SyncPage,
  SyncPublisher,
  SyncRunResult,
  SyncRecord,
  SyncTargetResult,
  SyncValidationContext,
  SqliteStagingPublisherOptions,
} from "../../src/features/synchronization/index.js";

describe("synchronization public API", () => {
  it("keeps P3 ports and results explicit", () => {
    expectTypeOf<PlanSyncInput>().toHaveProperty("availableDiskBytes").toEqualTypeOf<number>();
    expectTypeOf<SyncPublisher>().toHaveProperty("rollback").toBeFunction();
    expectTypeOf<SyncRunResult>().toHaveProperty("targets").toEqualTypeOf<readonly SyncTargetResult[]>();
    expectTypeOf<SyncValidationContext>().toHaveProperty("records").toEqualTypeOf<readonly SyncRecord[]>();
    expectTypeOf<SyncPage>().toHaveProperty("numberMatched").toEqualTypeOf<number | "unknown">();
    expectTypeOf<PagedWfsSourceOptions>().toHaveProperty("pages").toBeFunction();
    expectTypeOf<AddressPackage>().toHaveProperty("bytes").toEqualTypeOf<Uint8Array>();
    expectTypeOf<AddressPackageSourceOptions>().toHaveProperty("fetchPackage").toBeFunction();
    expectTypeOf<SqliteStagingPublisherOptions>().toHaveProperty("writeStaging").toBeFunction();
  });
});
