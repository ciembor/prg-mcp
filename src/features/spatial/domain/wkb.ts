import { Buffer } from "node:buffer";

import type {
  LineStringGeometry,
  MultiLineStringGeometry,
  MultiPointGeometry,
  MultiPolygonGeometry,
  PointGeometry,
  PolygonGeometry,
  Position,
  PrgGeometry,
} from "./geometry.js";

export class WkbError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "WkbError";
  }
}

const littleEndian = 1;
const pointType = 1;
const lineStringType = 2;
const polygonType = 3;
const multiPointType = 4;
const multiLineStringType = 5;
const multiPolygonType = 6;

export function encodeWkb(geometry: PrgGeometry): Uint8Array {
  return Uint8Array.from(writeGeometry(geometry));
}

export function decodeWkb(wkb: Uint8Array): PrgGeometry {
  const reader = new WkbReader(Buffer.from(wkb));
  const geometry = reader.readGeometry();
  reader.assertFullyRead();

  return geometry;
}

function writeGeometry(geometry: PrgGeometry): Buffer {
  if (geometry.type === "Point") {
    return concatHeader(pointType, writePointCoordinates(geometry.coordinates));
  }

  if (geometry.type === "LineString") {
    return writeLineStringGeometry(geometry);
  }

  if (geometry.type === "Polygon") {
    return writePolygonGeometry(geometry);
  }

  if (geometry.type === "MultiPoint") {
    return writeMultiGeometry(multiPointType, geometry.coordinates.map((coordinates) => writeGeometry({ coordinates, type: "Point" })));
  }

  if (geometry.type === "MultiLineString") {
    return writeMultiLineStringGeometry(geometry);
  }

  return writeMultiPolygonGeometry(geometry);
}

function writeLineStringGeometry(geometry: LineStringGeometry): Buffer {
  return concatHeader(lineStringType, writePositions(geometry.coordinates));
}

function writePolygonGeometry(geometry: PolygonGeometry): Buffer {
  const count = writeUInt32(geometry.coordinates.length);
  const rings = geometry.coordinates.map(writePositions);

  return concatHeader(polygonType, Buffer.concat([count, ...rings]));
}

function writeMultiLineStringGeometry(geometry: MultiLineStringGeometry): Buffer {
  return writeMultiGeometry(
    multiLineStringType,
    geometry.coordinates.map((coordinates) => writeGeometry({ coordinates, type: "LineString" })),
  );
}

function writeMultiPolygonGeometry(geometry: MultiPolygonGeometry): Buffer {
  return writeMultiGeometry(
    multiPolygonType,
    geometry.coordinates.map((coordinates) => writeGeometry({ coordinates, type: "Polygon" })),
  );
}

function writeMultiGeometry(type: number, geometries: readonly Buffer[]): Buffer {
  return concatHeader(type, Buffer.concat([writeUInt32(geometries.length), ...geometries]));
}

function concatHeader(type: number, payload: Buffer): Buffer {
  const header = Buffer.alloc(5);
  header.writeUInt8(littleEndian, 0);
  header.writeUInt32LE(type, 1);

  return Buffer.concat([header, payload]);
}

function writePositions(positions: readonly Position[]): Buffer {
  return Buffer.concat([writeUInt32(positions.length), ...positions.map(writePointCoordinates)]);
}

function writePointCoordinates([x, y]: Position): Buffer {
  const buffer = Buffer.alloc(16);
  buffer.writeDoubleLE(x, 0);
  buffer.writeDoubleLE(y, 8);

  return buffer;
}

function writeUInt32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value, 0);

  return buffer;
}

class WkbReader {
  private offset = 0;

  public constructor(private readonly buffer: Buffer) {}

  public readGeometry(): PrgGeometry {
    const byteOrder = this.readByteOrder();
    const geometryType = this.readUInt32(byteOrder);

    if (geometryType === pointType) {
      return this.readPoint(byteOrder);
    }

    if (geometryType === lineStringType) {
      return this.readLineString(byteOrder);
    }

    if (geometryType === polygonType) {
      return this.readPolygon(byteOrder);
    }

    if (geometryType === multiPointType) {
      return this.readMultiPoint();
    }

    if (geometryType === multiLineStringType) {
      return this.readMultiLineString();
    }

    if (geometryType === multiPolygonType) {
      return this.readMultiPolygon();
    }

    throw new WkbError(`Unsupported WKB geometry type: ${geometryType}.`);
  }

  public assertFullyRead(): void {
    if (this.offset !== this.buffer.byteLength) {
      throw new WkbError("WKB payload contains trailing bytes.");
    }
  }

  private readPoint(byteOrder: ByteOrder): PointGeometry {
    return {
      coordinates: this.readPosition(byteOrder),
      type: "Point",
    };
  }

  private readLineString(byteOrder: ByteOrder): LineStringGeometry {
    return {
      coordinates: this.readPositions(byteOrder),
      type: "LineString",
    };
  }

  private readPolygon(byteOrder: ByteOrder): PolygonGeometry {
    const ringCount = this.readUInt32(byteOrder);
    const rings: Position[][] = [];

    for (let index = 0; index < ringCount; index += 1) {
      rings.push(this.readPositions(byteOrder));
    }

    return {
      coordinates: rings,
      type: "Polygon",
    };
  }

  private readMultiPoint(): MultiPointGeometry {
    return {
      coordinates: this.readNestedGeometries("Point").map((geometry) => geometry.coordinates),
      type: "MultiPoint",
    };
  }

  private readMultiLineString(): MultiLineStringGeometry {
    return {
      coordinates: this.readNestedGeometries("LineString").map((geometry) => geometry.coordinates),
      type: "MultiLineString",
    };
  }

  private readMultiPolygon(): MultiPolygonGeometry {
    return {
      coordinates: this.readNestedGeometries("Polygon").map((geometry) => geometry.coordinates),
      type: "MultiPolygon",
    };
  }

  private readNestedGeometries<TType extends PrgGeometry["type"]>(expectedType: TType): Array<Extract<PrgGeometry, { type: TType }>> {
    const count = this.readUInt32("little");
    const geometries: Array<Extract<PrgGeometry, { type: TType }>> = [];

    for (let index = 0; index < count; index += 1) {
      const geometry = this.readGeometry();

      if (geometry.type !== expectedType) {
        throw new WkbError(`Invalid nested WKB geometry: expected ${expectedType}, got ${geometry.type}.`);
      }

      geometries.push(geometry as Extract<PrgGeometry, { type: TType }>);
    }

    return geometries;
  }

  private readPositions(byteOrder: ByteOrder): Position[] {
    const count = this.readUInt32(byteOrder);
    const positions: Position[] = [];

    for (let index = 0; index < count; index += 1) {
      positions.push(this.readPosition(byteOrder));
    }

    return positions;
  }

  private readPosition(byteOrder: ByteOrder): Position {
    const x = this.readDouble(byteOrder);
    const y = this.readDouble(byteOrder);

    return [x, y];
  }

  private readByteOrder(): ByteOrder {
    const byteOrder = this.readUInt8();

    if (byteOrder === 0) {
      return "big";
    }

    if (byteOrder === littleEndian) {
      return "little";
    }

    throw new WkbError(`Unsupported WKB byte order: ${byteOrder}.`);
  }

  private readUInt8(): number {
    this.assertAvailable(1);
    const value = this.buffer.readUInt8(this.offset);
    this.offset += 1;

    return value;
  }

  private readUInt32(byteOrder: ByteOrder): number {
    this.assertAvailable(4);
    const value = byteOrder === "little" ? this.buffer.readUInt32LE(this.offset) : this.buffer.readUInt32BE(this.offset);
    this.offset += 4;

    return value;
  }

  private readDouble(byteOrder: ByteOrder): number {
    this.assertAvailable(8);
    const value = byteOrder === "little" ? this.buffer.readDoubleLE(this.offset) : this.buffer.readDoubleBE(this.offset);
    this.offset += 8;

    return value;
  }

  private assertAvailable(byteCount: number): void {
    if (this.offset + byteCount > this.buffer.byteLength) {
      throw new WkbError("WKB payload ended unexpectedly.");
    }
  }
}

type ByteOrder = "little" | "big";
