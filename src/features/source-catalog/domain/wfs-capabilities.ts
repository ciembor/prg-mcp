export const prgWfsDefaultCrs = "urn:ogc:def:crs:EPSG::2180";

export type WfsFeatureType = {
  readonly name: string;
  readonly title: string;
  readonly defaultCrs: string;
  readonly otherCrs: readonly string[];
  readonly outputFormats: readonly string[];
};

export type WfsCapabilities = {
  readonly featureTypes: readonly WfsFeatureType[];
};

export type WfsCanaryLayerChange = {
  readonly layerId: string;
  readonly sourceName: string;
  readonly issues: readonly WfsCanaryLayerIssue[];
};

export type WfsCanaryLayerIssue =
  | {
      readonly kind: "title";
      readonly expected: string;
      readonly actual: string;
    }
  | {
      readonly kind: "defaultCrs";
      readonly expected: string;
      readonly actual: string;
    };

export type WfsCapabilitiesCanaryReport = {
  readonly ok: boolean;
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly changed: readonly WfsCanaryLayerChange[];
};
