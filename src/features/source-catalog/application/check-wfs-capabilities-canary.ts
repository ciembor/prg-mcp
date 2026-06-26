import { prgLayerCatalog } from "../domain/prg-layer-catalog.js";
import type { PrgLayer } from "../domain/prg-layer.js";
import { prgWfsDefaultCrs, type WfsCapabilities, type WfsCapabilitiesCanaryReport, type WfsCanaryLayerChange } from "../domain/wfs-capabilities.js";

export function checkWfsCapabilitiesCanary(
  capabilities: WfsCapabilities,
  expectedCatalog: readonly PrgLayer[] = prgLayerCatalog,
): WfsCapabilitiesCanaryReport {
  const expectedWfsLayers = expectedCatalog.filter((layer) => layer.sourceChannel === "wfs");
  const expectedBySourceName = new Map(expectedWfsLayers.map((layer) => [layer.sourceName, layer]));
  const actualBySourceName = new Map(capabilities.featureTypes.map((featureType) => [getFeatureTypeLocalName(featureType.name), featureType]));

  const added = [...actualBySourceName.keys()]
    .filter((sourceName) => !expectedBySourceName.has(sourceName))
    .sort();
  const removed = expectedWfsLayers
    .filter((layer) => !actualBySourceName.has(layer.sourceName))
    .map((layer) => layer.sourceName);
  const changed = expectedWfsLayers.flatMap((layer): readonly WfsCanaryLayerChange[] => {
    const actual = actualBySourceName.get(layer.sourceName);

    if (!actual) {
      return [];
    }

    const issues: WfsCanaryLayerChange["issues"] = [
      ...(actual.title === layer.titlePl
        ? []
        : [
            {
              kind: "title" as const,
              expected: layer.titlePl,
              actual: actual.title,
            },
          ]),
      ...(actual.defaultCrs === prgWfsDefaultCrs
        ? []
        : [
            {
              kind: "defaultCrs" as const,
              expected: prgWfsDefaultCrs,
              actual: actual.defaultCrs,
            },
          ]),
    ];

    if (issues.length === 0) {
      return [];
    }

    return [
      {
        layerId: layer.layerId,
        sourceName: layer.sourceName,
        issues,
      },
    ];
  });

  return {
    ok: added.length === 0 && removed.length === 0 && changed.length === 0,
    added,
    removed,
    changed,
  };
}

function getFeatureTypeLocalName(featureTypeName: string): string {
  const separatorIndex = featureTypeName.indexOf(":");

  return separatorIndex === -1 ? featureTypeName : featureTypeName.slice(separatorIndex + 1);
}
