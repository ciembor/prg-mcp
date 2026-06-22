import { listPrgLayers } from "../domain/prg-layer-catalog.js";
import type { PrgLayer } from "../domain/prg-layer.js";

export function listPrgLayerDefinitions(): readonly PrgLayer[] {
  return listPrgLayers();
}
