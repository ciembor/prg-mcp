import { createHash } from "node:crypto";

export type SchemaField = {
  readonly name: string;
  readonly type: string;
  readonly required: boolean;
};

export type SchemaFingerprint = {
  readonly algorithm: "sha256";
  readonly value: string;
  readonly fields: readonly SchemaField[];
};

export type SchemaComparisonReport = {
  readonly status: "compatible" | "warning" | "breaking";
  readonly addedFields: readonly SchemaField[];
  readonly missingFields: readonly SchemaField[];
  readonly missingCriticalFields: readonly string[];
  readonly typeChanges: readonly SchemaTypeChange[];
  readonly orderChanged: boolean;
};

export type SchemaTypeChange = {
  readonly fieldName: string;
  readonly expectedType: string;
  readonly actualType: string;
};

export function createSchemaFingerprint(fields: readonly SchemaField[]): SchemaFingerprint {
  const canonicalFields = [...fields].sort(compareFieldsByName);

  return {
    algorithm: "sha256",
    value: createHash("sha256").update(JSON.stringify(canonicalFields)).digest("hex"),
    fields: fields.map((field) => ({ ...field })),
  };
}

export function compareSchemaFingerprints(
  expected: SchemaFingerprint,
  actual: SchemaFingerprint,
  criticalFields: readonly string[],
): SchemaComparisonReport {
  const expectedByName = new Map(expected.fields.map((field) => [field.name, field]));
  const actualByName = new Map(actual.fields.map((field) => [field.name, field]));
  const addedFields = actual.fields.filter((field) => !expectedByName.has(field.name));
  const missingFields = expected.fields.filter((field) => !actualByName.has(field.name));
  const missingCriticalFields = criticalFields.filter((fieldName) => !actualByName.has(fieldName));
  const typeChanges = expected.fields.flatMap((field): readonly SchemaTypeChange[] => {
    const actualField = actualByName.get(field.name);

    if (!actualField || actualField.type === field.type) {
      return [];
    }

    return [
      {
        fieldName: field.name,
        expectedType: field.type,
        actualType: actualField.type,
      },
    ];
  });
  const criticalTypeChanges = typeChanges.filter((change) => criticalFields.includes(change.fieldName));
  const orderChanged = haveSameFieldNames(expected.fields, actual.fields) && !haveSameFieldOrder(expected.fields, actual.fields);

  return {
    status: getSchemaComparisonStatus(missingCriticalFields, criticalTypeChanges, addedFields, missingFields, typeChanges, orderChanged),
    addedFields,
    missingFields,
    missingCriticalFields,
    typeChanges,
    orderChanged,
  };
}

function getSchemaComparisonStatus(
  missingCriticalFields: readonly string[],
  criticalTypeChanges: readonly SchemaTypeChange[],
  addedFields: readonly SchemaField[],
  missingFields: readonly SchemaField[],
  typeChanges: readonly SchemaTypeChange[],
  orderChanged: boolean,
): SchemaComparisonReport["status"] {
  if (missingCriticalFields.length > 0 || criticalTypeChanges.length > 0) {
    return "breaking";
  }

  if (addedFields.length > 0 || missingFields.length > 0 || typeChanges.length > 0 || orderChanged) {
    return "warning";
  }

  return "compatible";
}

function compareFieldsByName(left: SchemaField, right: SchemaField): number {
  return left.name.localeCompare(right.name);
}

function haveSameFieldNames(left: readonly SchemaField[], right: readonly SchemaField[]): boolean {
  const leftNames = left.map((field) => field.name).sort();
  const rightNames = right.map((field) => field.name).sort();

  return leftNames.length === rightNames.length && leftNames.every((fieldName, index) => fieldName === rightNames[index]);
}

function haveSameFieldOrder(left: readonly SchemaField[], right: readonly SchemaField[]): boolean {
  return left.length === right.length && left.every((field, index) => field.name === right[index]?.name);
}
