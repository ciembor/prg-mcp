export type WmsLayer = {
  readonly name: string;
  readonly title: string;
  readonly queryable: boolean;
};

export type WmsCapabilities = {
  readonly layers: readonly WmsLayer[];
};

export type WmsPackageCatalogReport = {
  readonly ok: boolean;
  readonly missing: readonly string[];
  readonly unexpected: readonly string[];
  readonly changed: readonly WmsPackageLayerChange[];
};

export type WmsPackageLayerChange = {
  readonly layerName: string;
  readonly issues: readonly WmsPackageLayerIssue[];
};

export type WmsPackageLayerIssue =
  | {
      readonly kind: "title";
      readonly expected: string;
      readonly actual: string;
    }
  | {
      readonly kind: "queryable";
      readonly expected: true;
      readonly actual: boolean;
    };
