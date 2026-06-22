import { describe, expect, expectTypeOf, it } from "vitest";

import {
  compareSchemaFingerprints,
  createSchemaFingerprint,
  type SchemaComparisonReport,
  type SchemaField,
  type SchemaFingerprint,
  type SchemaTypeChange,
} from "../../../src/features/source-catalog/index.js";

const expectedFields: readonly SchemaField[] = [
  { name: "msGeometry", type: "gml:GeometryPropertyType", required: true },
  { name: "JPT_KOD_JE", type: "string", required: true },
  { name: "JPT_NAZWA_", type: "string", required: true },
  { name: "WERSJA_OD", type: "string", required: false },
];
const criticalFields = ["msGeometry", "JPT_KOD_JE", "JPT_NAZWA_"] as const;

describe("schema fingerprint policy", () => {
  it("keeps exported schema fingerprint types intentional", () => {
    expectTypeOf<SchemaFingerprint>().toHaveProperty("fields").toEqualTypeOf<readonly SchemaField[]>();
    expectTypeOf<SchemaComparisonReport>().toHaveProperty("typeChanges").toEqualTypeOf<readonly SchemaTypeChange[]>();
  });

  it("creates stable fingerprints independent of field order", () => {
    const expected = createSchemaFingerprint(expectedFields);
    const reordered = createSchemaFingerprint([...expectedFields].reverse());

    expect(reordered.value).toBe(expected.value);
    expect(expected.algorithm).toBe("sha256");
  });

  it("treats identical schemas as compatible", () => {
    const expected = createSchemaFingerprint(expectedFields);
    const actual = createSchemaFingerprint(expectedFields);

    expect(compareSchemaFingerprints(expected, actual, criticalFields)).toMatchObject({
      status: "compatible",
      addedFields: [],
      missingFields: [],
      missingCriticalFields: [],
      typeChanges: [],
      orderChanged: false,
    });
  });

  it("warns on additional fields and field order changes", () => {
    const expected = createSchemaFingerprint(expectedFields);
    const actual = createSchemaFingerprint([
      expectedFields[1]!,
      expectedFields[0]!,
      expectedFields[2]!,
      expectedFields[3]!,
      { name: "NEW_OPTIONAL", type: "string", required: false },
    ]);

    expect(compareSchemaFingerprints(expected, actual, criticalFields)).toMatchObject({
      status: "warning",
      addedFields: [{ name: "NEW_OPTIONAL", type: "string", required: false }],
      missingCriticalFields: [],
      orderChanged: false,
    });

    expect(compareSchemaFingerprints(expected, createSchemaFingerprint([...expectedFields].reverse()), criticalFields)).toMatchObject({
      status: "warning",
      orderChanged: true,
    });
  });

  it("breaks on missing critical fields or critical type changes", () => {
    const expected = createSchemaFingerprint(expectedFields);
    const missingCritical = createSchemaFingerprint(expectedFields.filter((field) => field.name !== "JPT_KOD_JE"));
    const changedCriticalType = createSchemaFingerprint(
      expectedFields.map((field) => (field.name === "JPT_NAZWA_" ? { ...field, type: "integer" } : field)),
    );

    expect(compareSchemaFingerprints(expected, missingCritical, criticalFields)).toMatchObject({
      status: "breaking",
      missingCriticalFields: ["JPT_KOD_JE"],
    });
    expect(compareSchemaFingerprints(expected, changedCriticalType, criticalFields)).toMatchObject({
      status: "breaking",
      typeChanges: [
        {
          fieldName: "JPT_NAZWA_",
          expectedType: "string",
          actualType: "integer",
        },
      ],
    });
  });
});
