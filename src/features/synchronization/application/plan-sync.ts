import { getPrgArchivalBoundaryPackage } from "../../source-catalog/domain/archival-boundary-catalog.js";
import { prgVoivodeshipCodes } from "../../persistence/index.js";
import { getPrgLayer, listPrgLayers } from "../../source-catalog/domain/prg-layer-catalog.js";
import type { PrgLayer } from "../../source-catalog/domain/prg-layer.js";
import {
  SyncPlanningError,
  type SyncMode,
  type SyncPlan,
  type SyncProfile,
  type SyncScope,
  type SyncTarget,
} from "../domain/sync-model.js";

const profileLayerIds: Readonly<Record<Exclude<SyncProfile, "administrative-history">, readonly string[]>> = {
  administrative: range("A", 0, 6),
  "cadastre-boundaries": range("A", 5, 6),
  jurisdictions: [
    ...range("R", 1, 2), ...range("S", 1, 4), ...range("P", 1, 3),
    ...range("K", 1, 13), ...range("U", 1, 11),
  ],
  maritime: range("W", 1, 12),
  addresses: ["A07", "A08"],
  "boundaries-full": listPrgLayers().filter((layer) => layer.sourceChannel === "wfs").map((layer) => layer.layerId),
  "poland-full": listPrgLayers().map((layer) => layer.layerId),
};

const downloadEstimateByChannel = { wfs: 8 * 1024 * 1024, "address-package": 220 * 1024 * 1024 } as const;
const diskMultiplierByChannel = { wfs: 2.5, "address-package": 4 } as const;

export type PlanSyncInput = {
  readonly mode: SyncMode;
  readonly profile?: SyncProfile;
  readonly layerIds?: readonly string[];
  readonly teryt?: readonly string[];
  readonly archiveYear?: number;
  readonly availableDiskBytes: number;
  readonly reserveDiskBytes?: number;
};

export function planSync(input: PlanSyncInput): SyncPlan {
  validateSyncMode(input.mode);
  const layers = resolveLayers(input);
  const requestedScopes = resolveScopes(input.teryt);
  validateScopeCompatibility(layers, requestedScopes);
  validateArchive(input, layers, requestedScopes);

  const targets = layers.flatMap((layer) => scopesForLayer(layer, requestedScopes).map((scope) => createTarget(layer, scope, input.archiveYear)));
  const estimatedDownloadBytes = sum(targets, "estimatedDownloadBytes");
  const estimatedDiskBytes = sum(targets, "estimatedDiskBytes");
  const requiredBytes = estimatedDiskBytes + (input.reserveDiskBytes ?? 256 * 1024 * 1024);

  if (requiredBytes > input.availableDiskBytes) {
    throw new SyncPlanningError("Not enough free disk space for PRG staging and publication.", "INSUFFICIENT_DISK_SPACE", {
      availableDiskBytes: input.availableDiskBytes,
      requiredBytes,
    });
  }

  return { mode: input.mode, profile: input.profile, targets, estimatedDownloadBytes, estimatedDiskBytes, availableDiskBytes: input.availableDiskBytes };
}

function validateSyncMode(mode: SyncMode): void {
  if (mode !== "missing" && mode !== "stale" && mode !== "force") {
    throw new SyncPlanningError(`Invalid sync mode: ${String(mode)}.`, "INVALID_MODE", { mode });
  }
}

function resolveLayers(input: PlanSyncInput): readonly PrgLayer[] {
  let ids = input.layerIds;
  if (!ids) {
    if (!input.profile) throw new SyncPlanningError("A profile or explicit layers are required.", "INVALID_PROFILE");
    ids = input.profile === "administrative-history" ? range("A", 0, 4) : profileLayerIds[input.profile];
  }

  return [...new Set(ids)].map((id) => {
    const layer = getPrgLayer(id);
    if (!layer) throw new SyncPlanningError(`Unknown PRG layer: ${id}.`, "INVALID_LAYER", { layerId: id });
    return layer;
  });
}

function resolveScopes(values: readonly string[] | undefined): readonly SyncScope[] | undefined {
  if (!values || values.length === 0) {
    return undefined;
  }
  return [...new Set(values)].map(parseTerytScope);
}

function parseTerytScope(code: string): SyncScope {
  if (!/^\d{2}(?:\d{2}(?:\d{2}[1-5])?)?$/u.test(code)) {
    throw new SyncPlanningError(`Invalid TERYT scope: ${code}.`, "INVALID_TERYT", { code });
  }
  if (!prgVoivodeshipCodes.includes(code.slice(0, 2) as never)) {
    throw new SyncPlanningError(`Invalid TERYT voivodeship code: ${code.slice(0, 2)}.`, "INVALID_TERYT", { code });
  }
  let type: SyncScope["type"] = "municipality";
  if (code.length === 2) type = "voivodeship";
  if (code.length === 4) type = "county";
  return { type, code, shardCode: code.slice(0, 2) };
}

function validateArchive(input: PlanSyncInput, layers: readonly PrgLayer[], scopes: readonly SyncScope[] | undefined): void {
  if (input.profile === "administrative-history" && input.archiveYear === undefined) {
    throw new SyncPlanningError("administrative-history requires archiveYear.", "MISSING_ARCHIVE_YEAR");
  }

  if (input.profile !== "administrative-history" && input.archiveYear === undefined) return;
  const archive = input.archiveYear === undefined ? undefined : getPrgArchivalBoundaryPackage(input.archiveYear);
  if (!archive || layers.some((layer) => !archive.containsLayerIds.includes(layer.layerId as never)) || (scopes ?? []).some((scope) => scope.type !== "country")) {
    throw new SyncPlanningError("Requested immutable administrative archive is not available for this selection.", "ARCHIVE_NOT_AVAILABLE", { archiveYear: input.archiveYear });
  }
}

function validateScopeCompatibility(layers: readonly PrgLayer[], scopes: readonly SyncScope[] | undefined): void {
  const hasWfsLayer = layers.some((layer) => layer.sourceChannel === "wfs");
  const hasAddressLayer = layers.some((layer) => layer.sourceChannel === "address-package");
  const hasNonCountryScope = (scopes ?? []).some((scope) => scope.type !== "country");

  if (hasWfsLayer && !hasAddressLayer && hasNonCountryScope) {
    throw new SyncPlanningError("TERYT scopes are supported only for address-package layers.", "INVALID_TERYT", { scopes });
  }

  if (hasWfsLayer && hasAddressLayer && hasNonCountryScope) {
    throw new SyncPlanningError("TERYT scopes cannot be mixed with WFS layers because WFS synchronization is country-wide.", "INVALID_TERYT", { scopes });
  }
}

function scopesForLayer(layer: PrgLayer, scopes: readonly SyncScope[] | undefined): readonly SyncScope[] {
  if (layer.sourceChannel === "wfs") {
    return [{ type: "country", code: "PL" }];
  }

  return scopes ?? prgVoivodeshipCodes.map((code) => ({ code, shardCode: code, type: "voivodeship" }));
}

function createTarget(layer: PrgLayer, scope: SyncScope, archiveYear?: number): SyncTarget {
  const scopeFactors: Readonly<Record<SyncScope["type"], number>> = {
    country: 16,
    voivodeship: 1,
    county: 0.2,
    municipality: 0.04,
  };
  const scopeFactor = scopeFactors[scope.type];
  const estimatedDownloadBytes = Math.ceil(downloadEstimateByChannel[layer.sourceChannel] * scopeFactor);
  return {
    archiveYear,
    datasetKey: archiveYear ? `archive:${archiveYear}:${layer.layerId}` : `current:${layer.layerId}`,
    estimatedDiskBytes: Math.ceil(estimatedDownloadBytes * diskMultiplierByChannel[layer.sourceChannel]),
    estimatedDownloadBytes,
    layer,
    scope,
  };
}

function range(prefix: string, start: number, end: number): string[] {
  return Array.from({ length: end - start + 1 }, (_, index) => `${prefix}${String(start + index).padStart(2, "0")}`);
}

function sum(targets: readonly SyncTarget[], property: "estimatedDownloadBytes" | "estimatedDiskBytes"): number {
  return targets.reduce((total, target) => total + target[property], 0);
}
