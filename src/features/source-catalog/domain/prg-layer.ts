export const prgLayerCategories = [
  "administrative",
  "address",
  "statistical",
  "court",
  "prosecution",
  "service",
  "office",
  "maritime",
] as const;

export type PrgLayerCategory = (typeof prgLayerCategories)[number];

export const prgGeometryTypes = [
  "point",
  "line",
  "polygon",
] as const;

export type PrgGeometryType = (typeof prgGeometryTypes)[number];

export const prgSourceChannels = [
  "wfs",
  "address-package",
] as const;

export type PrgSourceChannel = (typeof prgSourceChannels)[number];

export type PrgLayer = {
  readonly layerId: string;
  readonly sourceName: string;
  readonly titlePl: string;
  readonly category: PrgLayerCategory;
  readonly geometryType: PrgGeometryType;
  readonly sourceChannel: PrgSourceChannel;
};
