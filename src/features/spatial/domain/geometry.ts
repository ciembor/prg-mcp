export type Position = readonly [number, number];

export type PointGeometry = {
  type: "Point";
  coordinates: Position;
};

export type MultiPointGeometry = {
  type: "MultiPoint";
  coordinates: readonly Position[];
};

export type LineStringGeometry = {
  type: "LineString";
  coordinates: readonly Position[];
};

export type MultiLineStringGeometry = {
  type: "MultiLineString";
  coordinates: readonly (readonly Position[])[];
};

export type PolygonGeometry = {
  type: "Polygon";
  coordinates: readonly (readonly Position[])[];
};

export type MultiPolygonGeometry = {
  type: "MultiPolygon";
  coordinates: readonly (readonly (readonly Position[])[])[];
};

export type PrgGeometry =
  | PointGeometry
  | MultiPointGeometry
  | LineStringGeometry
  | MultiLineStringGeometry
  | PolygonGeometry
  | MultiPolygonGeometry;

export type BoundingBox = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type RtreeRow = {
  id: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

type WeightedCentroid = {
  point: Position;
  weight: number;
};

export function bboxOfGeometry(geometry: PrgGeometry): BoundingBox {
  const positions = collectPositions(geometry);

  if (positions.length === 0) {
    throw new Error(`Cannot compute bbox for empty ${geometry.type}.`);
  }

  return positions.reduce<BoundingBox>(
    (bbox, [x, y]) => ({
      maxX: Math.max(bbox.maxX, x),
      maxY: Math.max(bbox.maxY, y),
      minX: Math.min(bbox.minX, x),
      minY: Math.min(bbox.minY, y),
    }),
    {
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
    },
  );
}

export function centroidOfGeometry(geometry: PrgGeometry): PointGeometry {
  if (geometry.type === "Point") {
    return geometry;
  }

  const centroid = centroidPosition(geometry);

  return {
    coordinates: centroid,
    type: "Point",
  };
}

export function toRtreeRow(id: number, bbox: BoundingBox): RtreeRow {
  return {
    id,
    maxX: bbox.maxX,
    maxY: bbox.maxY,
    minX: bbox.minX,
    minY: bbox.minY,
  };
}

export function toSqliteRtreeValues(row: RtreeRow): readonly [number, number, number, number, number] {
  return [row.id, row.minX, row.maxX, row.minY, row.maxY];
}

function centroidPosition(geometry: Exclude<PrgGeometry, PointGeometry>): Position {
  if (geometry.type === "LineString") {
    return lineCentroid(geometry.coordinates);
  }

  if (geometry.type === "MultiLineString") {
    return combineWeighted(geometry.coordinates.map(lineCentroidWeighted));
  }

  if (geometry.type === "Polygon") {
    return polygonCentroid(geometry.coordinates);
  }

  if (geometry.type === "MultiPolygon") {
    return combineWeighted(geometry.coordinates.map(polygonCentroidWeighted));
  }

  return averagePosition(geometry.coordinates);
}

function collectPositions(geometry: PrgGeometry): Position[] {
  if (geometry.type === "Point") {
    return [geometry.coordinates];
  }

  if (geometry.type === "MultiPoint" || geometry.type === "LineString") {
    return [...geometry.coordinates];
  }

  if (geometry.type === "MultiLineString" || geometry.type === "Polygon") {
    return geometry.coordinates.flatMap((line) => [...line]);
  }

  return geometry.coordinates.flatMap((polygon) => polygon.flatMap((ring) => [...ring]));
}

function lineCentroid(line: readonly Position[]): Position {
  return lineCentroidWeighted(line).point;
}

function lineCentroidWeighted(line: readonly Position[]): WeightedCentroid {
  const segments = lineSegments(line);
  let weightedX = 0;
  let weightedY = 0;
  let totalLength = 0;

  for (const [start, end] of segments) {
    const length = distance(start, end);
    weightedX += ((start[0] + end[0]) / 2) * length;
    weightedY += ((start[1] + end[1]) / 2) * length;
    totalLength += length;
  }

  if (totalLength === 0) {
    return {
      point: averagePosition(line),
      weight: 0,
    };
  }

  return {
    point: [weightedX / totalLength, weightedY / totalLength],
    weight: totalLength,
  };
}

function polygonCentroid(polygon: readonly (readonly Position[])[]): Position {
  return polygonCentroidWeighted(polygon).point;
}

function polygonCentroidWeighted(polygon: readonly (readonly Position[])[]): WeightedCentroid {
  const [outerRing, ...holes] = polygon;

  if (!outerRing) {
    return {
      point: [0, 0],
      weight: 0,
    };
  }

  const outer = ringCentroidWeighted(outerRing);
  let weightedX = outer.point[0] * outer.weight;
  let weightedY = outer.point[1] * outer.weight;
  let totalArea = outer.weight;

  for (const hole of holes) {
    const weightedHole = ringCentroidWeighted(hole);
    weightedX -= weightedHole.point[0] * weightedHole.weight;
    weightedY -= weightedHole.point[1] * weightedHole.weight;
    totalArea -= weightedHole.weight;
  }

  if (totalArea <= 0) {
    return {
      point: averagePosition(polygon.flatMap((ring) => [...ring])),
      weight: 0,
    };
  }

  return {
    point: [weightedX / totalArea, weightedY / totalArea],
    weight: totalArea,
  };
}

function ringCentroidWeighted(ring: readonly Position[]): WeightedCentroid {
  const segments = closedRingSegments(ring);
  let twiceArea = 0;
  let weightedX = 0;
  let weightedY = 0;

  for (const [[x1, y1], [x2, y2]] of segments) {
    const cross = x1 * y2 - x2 * y1;
    twiceArea += cross;
    weightedX += (x1 + x2) * cross;
    weightedY += (y1 + y2) * cross;
  }

  if (twiceArea === 0) {
    return {
      point: averagePosition(ring),
      weight: 0,
    };
  }

  return {
    point: [weightedX / (3 * twiceArea), weightedY / (3 * twiceArea)],
    weight: Math.abs(twiceArea / 2),
  };
}

function combineWeighted(weightedCentroids: readonly WeightedCentroid[]): Position {
  const totalWeight = weightedCentroids.reduce((sum, weighted) => sum + weighted.weight, 0);

  if (totalWeight === 0) {
    return averagePosition(weightedCentroids.map((weighted) => weighted.point));
  }

  return [
    weightedCentroids.reduce((sum, weighted) => sum + weighted.point[0] * weighted.weight, 0) / totalWeight,
    weightedCentroids.reduce((sum, weighted) => sum + weighted.point[1] * weighted.weight, 0) / totalWeight,
  ];
}

function averagePosition(positions: readonly Position[]): Position {
  if (positions.length === 0) {
    return [0, 0];
  }

  return [
    positions.reduce((sum, [x]) => sum + x, 0) / positions.length,
    positions.reduce((sum, [, y]) => sum + y, 0) / positions.length,
  ];
}

function lineSegments(line: readonly Position[]): Array<readonly [Position, Position]> {
  const segments: Array<readonly [Position, Position]> = [];

  for (let index = 1; index < line.length; index += 1) {
    segments.push([line[index - 1] as Position, line[index] as Position]);
  }

  return segments;
}

function closedRingSegments(ring: readonly Position[]): Array<readonly [Position, Position]> {
  if (ring.length === 0) {
    return [];
  }

  const segments = lineSegments(ring);
  const first = ring[0] as Position;
  const last = ring.at(-1) as Position;

  if (first[0] !== last[0] || first[1] !== last[1]) {
    segments.push([last, first]);
  }

  return segments;
}

function distance([x1, y1]: Position, [x2, y2]: Position): number {
  return Math.hypot(x2 - x1, y2 - y1);
}
