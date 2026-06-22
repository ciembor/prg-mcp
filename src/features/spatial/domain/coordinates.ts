export type Epsg2180Point = {
  x: number;
  y: number;
};

export type Epsg4326Point = {
  longitude: number;
  latitude: number;
};

export class CoordinateTransformError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "CoordinateTransformError";
  }
}
