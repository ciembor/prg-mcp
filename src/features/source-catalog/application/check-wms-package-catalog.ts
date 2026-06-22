import { prgWmsPackageCatalog } from "../domain/wms-package-catalog.js";
import type { PrgWmsPackageLayer } from "../domain/wms-package-catalog.js";
import type { WmsCapabilities, WmsPackageCatalogReport, WmsPackageLayerChange } from "../domain/wms-capabilities.js";

export function checkWmsPackageCatalog(
  capabilities: WmsCapabilities,
  expectedCatalog: readonly PrgWmsPackageLayer[] = prgWmsPackageCatalog,
): WmsPackageCatalogReport {
  const expectedByName = new Map(expectedCatalog.map((layer) => [layer.layerName, layer]));
  const actualByName = new Map(capabilities.layers.map((layer) => [layer.name, layer]));
  const missing = expectedCatalog.filter((layer) => !actualByName.has(layer.layerName)).map((layer) => layer.layerName);
  const unexpected = capabilities.layers
    .map((layer) => layer.name)
    .filter((layerName) => !expectedByName.has(layerName))
    .sort();
  const changed = expectedCatalog.flatMap((expected): readonly WmsPackageLayerChange[] => {
    const actual = actualByName.get(expected.layerName);

    if (!actual) {
      return [];
    }

    const issues: WmsPackageLayerChange["issues"] = [
      ...(actual.title === expected.title
        ? []
        : [
            {
              kind: "title" as const,
              expected: expected.title,
              actual: actual.title,
            },
          ]),
      ...(actual.queryable
        ? []
        : [
            {
              kind: "queryable" as const,
              expected: true as const,
              actual: actual.queryable,
            },
          ]),
    ];

    if (issues.length === 0) {
      return [];
    }

    return [
      {
        layerName: expected.layerName,
        issues,
      },
    ];
  });

  return {
    ok: missing.length === 0 && unexpected.length === 0 && changed.length === 0,
    missing,
    unexpected,
    changed,
  };
}
