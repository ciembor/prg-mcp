export type GmlCoordinateGeometryType =
  | "Point"
  | "LineString"
  | "Polygon"
  | "MultiPoint"
  | "MultiLineString"
  | "MultiPolygon"
  | "MultiCurve"
  | "MultiSurface";

export type GmlCoordinateGeometry = {
  type: GmlCoordinateGeometryType;
  srsName?: string;
  coordinateText: string;
  coordinateElement: "pos" | "posList";
};

export type GmlFeature = {
  id?: string;
  typeName: string;
  namespaceUri?: string;
  properties: Readonly<Record<string, readonly string[]>>;
  geometries: readonly GmlCoordinateGeometry[];
};

export class GmlSecurityError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "GmlSecurityError";
  }
}
