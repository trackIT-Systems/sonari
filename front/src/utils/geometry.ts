import { bbox }  from "@turf/bbox";
import { booleanPointInPolygon } from "@turf/boolean-point-in-polygon";

import { MAX_FREQ, SPECTROGRAM_CANVAS_DIMENSIONS } from "@/constants";

import type {
  BoundingBox,
  Box,
  Coordinates,
  Geometry,
  LineString,
  MultiLineString,
  MultiPoint,
  MultiPolygon,
  Point,
  Polygon,
  SpectrogramWindow,
  TimeInterval,
  TimeStamp,
} from "@/types";

export function bboxIntersection(bbox1: Box, bbox2: Box): Box | null {
  const [left1, top1, right1, bottom1] = bbox1;
  const [left2, top2, right2, bottom2] = bbox2;
  const left = Math.max(left1, left2);
  const top = Math.max(top1, top2);
  const right = Math.min(right1, right2);
  const bottom = Math.min(bottom1, bottom2);
  if (left > right || top > bottom) return null;
  return [left, top, right, bottom];
}

export function scaleTimeToWindow(
  value: number,
  window: SpectrogramWindow,
): number {
  const { time } = window;
  if (time.max === time.min) return time.max;
  return (SPECTROGRAM_CANVAS_DIMENSIONS.width * (value - time.min)) / (time.max - time.min);
}

/** Transform x coordinates to time */
export function scaleXToWindow(
  value: number,
  window: SpectrogramWindow,
  relative: boolean = false,
): number {
  const { time } = window;
  const duration = time.max - time.min;
  if (relative) {
    return (duration * value) / SPECTROGRAM_CANVAS_DIMENSIONS.width;
  }
  return time.min + (duration * value) / SPECTROGRAM_CANVAS_DIMENSIONS.width;
}

/** Transform y coordinates to frequency */
function scaleFreqToWindow(
  value: number,
  window: SpectrogramWindow,
): number {
  const { freq } = window;
  if (freq.max === freq.min) return freq.max;
  return (SPECTROGRAM_CANVAS_DIMENSIONS.height * (freq.max - value)) / (freq.max - freq.min);
}

export function scaleYToWindow(
  value: number,
  window: SpectrogramWindow,
  relative: boolean = false,
): number {
  const { freq } = window;
  const bandwidth = freq.max - freq.min;
  if (relative) {
    return (bandwidth * value) / SPECTROGRAM_CANVAS_DIMENSIONS.height;
  }
  return freq.max - (bandwidth * value) / SPECTROGRAM_CANVAS_DIMENSIONS.height;
}

export function scalePixelsToWindow(
  position: { x: number; y: number },
  window: SpectrogramWindow,
  relative: boolean = false,
): { time: number; freq: number } {
  const { x, y } = position;
  const time = scaleXToWindow(x, window, relative);
  const freq = scaleYToWindow(y, window, relative);
  return { time, freq };
}

function scaleIntervalToWindow(
  interval: Coordinates,
  window: SpectrogramWindow,
): Coordinates {
  let [start, end] = interval;
  start = scaleTimeToWindow(start, window);
  end = scaleTimeToWindow(end, window);
  return [start, end];
}

export function scaleBBoxToWindow(
  bbox: Box,
  window: SpectrogramWindow,
): Box {
  const [startTime, lowFreq, endTime, highFreq] = bbox;
  const start = scaleTimeToWindow(startTime, window);
  const end = scaleTimeToWindow(endTime, window);
  const top = scaleFreqToWindow(highFreq, window);
  const bottom = scaleFreqToWindow(lowFreq, window);
  return [
    Math.min(start, end),
    Math.min(top, bottom),
    Math.max(start, end),
    Math.max(top, bottom),
  ];
}

export function scalePositionToWindow(
  position: Coordinates,
  window: SpectrogramWindow,
): Coordinates {
  let [x, y] = position;
  x = scaleTimeToWindow(x, window);
  y = scaleFreqToWindow(y, window);
  return [x, y];
}

function scalePathToWindow(
  path: Coordinates[],
  window: SpectrogramWindow,
): Coordinates[] {
  return path.map((pos) => scalePositionToWindow(pos, window));
}

function scalePathArrayToWindow(
  pathArray: Coordinates[][],
  window: SpectrogramWindow,
): Coordinates[][] {
  return pathArray.map((path) => scalePathToWindow(path, window));
}


export function scaleGeometryToWindow<T extends Geometry>(
  geometry: T,
  window: SpectrogramWindow,
): T {
  const { type } = geometry;

  switch (type) {
    case "TimeStamp":
      return {
        ...geometry,
        coordinates: scaleTimeToWindow(
          geometry.coordinates,
          window,
        ),
      };
    case "TimeInterval":
      return {
        ...geometry,
        coordinates: scaleIntervalToWindow(
          // @ts-ignore
          geometry.coordinates,
          window,
        ),
      };
    case "Point":
      return {
        ...geometry,
        coordinates: scalePositionToWindow(
          geometry.coordinates,
          window,
        ),
      };
    case "BoundingBox":
      return {
        ...geometry,
        // @ts-ignore
        coordinates: scaleBBoxToWindow(geometry.coordinates, window),
      };
    case "MultiPoint":
      return {
        ...geometry,
        coordinates: scalePathToWindow(geometry.coordinates, window),
      };
    case "LineString":
      return {
        ...geometry,
        coordinates: scalePathToWindow(geometry.coordinates, window),
      };
    case "MultiLineString":
      return {
        ...geometry,
        coordinates: scalePathArrayToWindow(
          geometry.coordinates,
          window,
        ),
      };
    case "Polygon":
      return {
        ...geometry,
        coordinates: scalePathArrayToWindow(
          geometry.coordinates,
          window,
        ),
      };
    case "MultiPolygon":
      return {
        ...geometry,
        coordinates: geometry.coordinates.map((polygon) =>
          scalePathArrayToWindow(polygon, window),
        ),
      };

    default:
      // eslint-disable-next-line no-console
      console.error(`Unknown geometry type ${type} at scaling`);
      return geometry;
  }
}

const IS_CLOSE_THRESHOLD = 5;

function isCloseTonumber(
  position: Coordinates,
  onset: number,
  threshold = IS_CLOSE_THRESHOLD,
): boolean {
  const [x] = position;
  return Math.abs(onset - x) < threshold;
}

function isCloseToInterval(
  position: Coordinates,
  interval: Coordinates,
  threshold = IS_CLOSE_THRESHOLD,
): boolean {
  const [x] = position;
  const [start, end] = interval;
  return x > start - threshold && x < end + threshold;
}

function isCloseToBBox(
  position: Coordinates,
  bbox: Box,
  threshold = IS_CLOSE_THRESHOLD,
): boolean {
  const [x, y] = position;
  const [left, top, right, bottom] = bbox;
  return (
    x > left - threshold &&
    x < right + threshold &&
    y > top - threshold &&
    y < bottom + threshold
  );
}

function distance(point1: Coordinates, point2: Coordinates): number {
  const [x1, y1] = point1;
  const [x2, y2] = point2;
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

function isCloseToPoint(
  position: Coordinates,
  geometry: Point,
  threshold = IS_CLOSE_THRESHOLD,
): boolean {
  return distance(position, geometry.coordinates) < threshold;
}

function isCloseToMultiPoint(
  position: Coordinates,
  geometry: MultiPoint,
  threshold = IS_CLOSE_THRESHOLD,
): boolean {
  return (
    Math.min(...geometry.coordinates.map((pos) => distance(position, pos))) <
    threshold
  );
}

function pointToEdgeDistance(
  point: Coordinates,
  edge: [Coordinates, Coordinates],
): number {
  const [start, end] = edge;
  const l2 = distance(start, end) ** 2;
  if (l2 === 0) return distance(point, start);

  let t =
    ((point[0] - start[0]) * (end[0] - start[0]) +
      (point[1] - start[1]) * (end[1] - start[1])) /
    l2;

  t = Math.max(0, Math.min(1, t));

  const closest: Coordinates = [
    start[0] + t * (end[0] - start[0]),
    start[1] + t * (end[1] - start[1]),
  ];

  return distance(point, closest);
}

function pointToLineDistance(
  point: Coordinates,
  linestring: LineString,
): number {
  const distances = linestring.coordinates.slice(1).map((end, index) => {
    const start = linestring.coordinates[index];
    return pointToEdgeDistance(point, [start, end]);
  });
  return Math.min(...distances);
}

function isCloseToLineString(
  position: Coordinates,
  geometry: LineString,
  threshold = IS_CLOSE_THRESHOLD,
): boolean {
  const dist = pointToLineDistance(position, {
    type: "LineString",
    coordinates: geometry.coordinates,
  });
  return dist < threshold;
}

function isCloseToMultiLineString(
  position: Coordinates,
  geometry: MultiLineString,
  threshold = IS_CLOSE_THRESHOLD,
): boolean {
  return geometry.coordinates.some((linestring) =>
    isCloseToLineString(
      position,
      {
        type: "LineString",
        coordinates: linestring,
      },
      threshold,
    ),
  );
}

function isCloseToPolygon(
  position: Coordinates,
  geometry: Polygon,
): boolean {
  return booleanPointInPolygon(position, geometry);
}

function isCloseToMultiPolygon(
  position: Coordinates,
  geometry: MultiPolygon,
): boolean {
  return geometry.coordinates.some((polygon) =>
    isCloseToPolygon(position, {
      type: "Polygon",
      coordinates: polygon,
    }),
  );
}

export function isCloseToGeometry(
  position: Coordinates,
  geometry: Geometry,
  threshold = IS_CLOSE_THRESHOLD,
): boolean {
  switch (geometry.type) {
    case "TimeStamp":
      return isCloseTonumber(position, geometry.coordinates, threshold);
    case "TimeInterval":
      // @ts-ignore
      return isCloseToInterval(position, geometry.coordinates, threshold);
    case "BoundingBox":
      // @ts-ignore
      return isCloseToBBox(position, geometry.coordinates, threshold);
    case "Point":
      return isCloseToPoint(position, geometry, threshold);
    case "MultiPoint":
      return isCloseToMultiPoint(position, geometry, threshold);
    case "LineString":
      return isCloseToLineString(position, geometry, threshold);
    case "MultiLineString":
      return isCloseToMultiLineString(position, geometry, threshold);
    case "Polygon":
      return isCloseToPolygon(position, geometry);
    case "MultiPolygon":
      return isCloseToMultiPolygon(position, geometry);
    default:
      return false;
  }
}

function shiftPoint(
  geom: Point,
  start: Coordinates,
  end: Coordinates,
): Point {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const [x, y] = geom.coordinates;
  return {
    ...geom,
    coordinates: [x + dx, y + dy],
  };
}

function shiftMultiPoint(
  geom: MultiPoint,
  start: Coordinates,
  end: Coordinates,
): MultiPoint {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  return {
    ...geom,
    coordinates: geom.coordinates.map(([x, y]) => [x + dx, y + dy]),
  };
}

function shiftLineString(
  geom: LineString,
  start: Coordinates,
  end: Coordinates,
): LineString {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  return {
    ...geom,
    coordinates: geom.coordinates.map((point) => [
      point[0] + dx,
      point[1] + dy,
    ]),
  };
}

function shiftMultiLineString(
  geom: MultiLineString,
  start: Coordinates,
  end: Coordinates,
): MultiLineString {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  return {
    ...geom,
    coordinates: geom.coordinates.map((points) =>
      points.map(([x, y]) => [x + dx, y + dy]),
    ),
  };
}

export function shiftPolygon(
  geom: Polygon,
  start: Coordinates,
  end: Coordinates,
): Polygon {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  return {
    ...geom,
    coordinates: geom.coordinates.map((points) =>
      points.map(([x, y]) => [x + dx, y + dy]),
    ),
  };
}

function shiftMultiPolygon(
  geom: MultiPolygon,
  start: Coordinates,
  end: Coordinates,
): MultiPolygon {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  return {
    ...geom,
    coordinates: geom.coordinates.map((polygon) =>
      polygon.map((points) => points.map(([x, y]) => [x + dx, y + dy])),
    ),
  };
}

function shiftTimeStamp(
  geom: TimeStamp,
  start: Coordinates,
  end: Coordinates,
): TimeStamp {
  const dx = end[0] - start[0];
  return {
    ...geom,
    coordinates: geom.coordinates + dx,
  };
}

function shiftTimeInterval(
  geom: TimeInterval,
  start: Coordinates,
  end: Coordinates,
): TimeInterval {
  const dx = end[0] - start[0];
  return {
    ...geom,
    coordinates: [geom.coordinates[0] + dx, geom.coordinates[1] + dx],
  };
}

function shiftBoundingBBox(
  geom: BoundingBox,
  start: Coordinates,
  end: Coordinates,
): BoundingBox {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  return {
    ...geom,
    coordinates: [
      geom.coordinates[0] + dx,
      geom.coordinates[1] + dy,
      geom.coordinates[2] + dx,
      geom.coordinates[3] + dy,
    ],
  };
}

export function shiftGeometry(
  geom: Geometry,
  start: Coordinates,
  end: Coordinates,
): Geometry {
  const { type } = geom;
  switch (type) {
    case "TimeStamp":
      return shiftTimeStamp(geom, start, end);

    case "TimeInterval":
      return shiftTimeInterval(geom, start, end);

    case "BoundingBox":
      return shiftBoundingBBox(geom, start, end);

    case "Point":
      return shiftPoint(geom, start, end);

    case "MultiPoint":
      return shiftMultiPoint(geom, start, end);

    case "LineString":
      return shiftLineString(geom, start, end);

    case "MultiLineString":
      return shiftMultiLineString(geom, start, end);

    case "Polygon":
      return shiftPolygon(geom, start, end);

    case "MultiPolygon":
      return shiftMultiPolygon(geom, start, end);

    default:
      throw Error(`Cannot shift geometry of unknown type ${type}`);
  }
}

function isTimeStampInWindow(
  geom: TimeStamp,
  window: SpectrogramWindow,
): boolean {
  const { time } = window;
  return geom.coordinates >= time.min && geom.coordinates <= time.max;
}

function isTimeIntervalInWindow(
  geom: TimeInterval,
  window: SpectrogramWindow,
): boolean {
  const { time } = window;
  const [start, end] = geom.coordinates;
  return end >= time.min && start <= time.max;
}

function isBoundingBoxInWindow(
  geom: BoundingBox,
  window: SpectrogramWindow,
) {
  const { time, freq } = window;
  const [startTime, lowFreq, endTime, highFreq] = geom.coordinates;
  return (
    startTime <= time.max &&
    endTime >= time.min &&
    lowFreq <= freq.max &&
    highFreq >= freq.min
  );
}

function isPointInWindow(geom: Point, window: SpectrogramWindow) {
  const { time, freq } = window;
  const [x, y] = geom.coordinates;
  return x <= time.max && x >= time.min && y <= freq.max && y >= freq.min;
}

function isLineStringInWindow(
  geom: LineString,
  window: SpectrogramWindow,
) {
  const bbox = computeGeometryBBox(geom);
  return isBoundingBoxInWindow(
    { type: "BoundingBox", coordinates: bbox },
    window,
  );
}

function isPolygonInWindow(geom: Polygon, window: SpectrogramWindow) {
  const bbox = computeGeometryBBox(geom);
  return isBoundingBoxInWindow(
    { type: "BoundingBox", coordinates: bbox },
    window,
  );
}

function isMultiPointInWindow(
  geom: MultiPoint,
  window: SpectrogramWindow,
) {
  const { time, freq } = window;
  return geom.coordinates.some(([x, y]) => {
    return x <= time.max && x >= time.min && y <= freq.max && y >= freq.min;
  });
}

function isMultiLineStringInWindow(
  geom: MultiLineString,
  window: SpectrogramWindow,
) {
  return geom.coordinates.some((line) => {
    return isLineStringInWindow(
      {
        type: "LineString",
        coordinates: line,
      },
      window,
    );
  });
}

function isMultiPolygonInWindow(
  geom: MultiPolygon,
  window: SpectrogramWindow,
) {
  return geom.coordinates.some((polygon) => {
    return isPolygonInWindow(
      {
        type: "Polygon",
        coordinates: polygon,
      },
      window,
    );
  });
}

export function isGeometryInWindow(
  geom: Geometry,
  window: SpectrogramWindow,
): boolean {
  const { type } = geom;
  switch (type) {
    case "TimeStamp":
      return isTimeStampInWindow(geom, window);

    case "TimeInterval":
      return isTimeIntervalInWindow(geom, window);

    case "BoundingBox":
      return isBoundingBoxInWindow(geom, window);

    case "Point":
      return isPointInWindow(geom, window);

    case "MultiPoint":
      return isMultiPointInWindow(geom, window);

    case "LineString":
      return isLineStringInWindow(geom, window);

    case "MultiLineString":
      return isMultiLineStringInWindow(geom, window);

    case "Polygon":
      return isPolygonInWindow(geom, window);

    case "MultiPolygon":
      return isMultiPolygonInWindow(geom, window);

    default:
      throw Error(
        `Cannot check if geometry of unknown type ${type} is in window`,
      );
  }
}

function computeTimeStampBBox(geometry: TimeStamp): Box {
  return [geometry.coordinates, 0, geometry.coordinates, MAX_FREQ];
}

function computeTimeIntervalBBox(geometry: TimeInterval): Box {
  return [geometry.coordinates[0], 0, geometry.coordinates[1], MAX_FREQ];
}

function computeBoundingBoxBBox(geometry: BoundingBox): Box {
  // @ts-ignore
  return geometry.coordinates;
}

export function computeGeometryBBox(geometry: Geometry): Box {
  const { type } = geometry;
  switch (type) {
    case "TimeStamp":
      return computeTimeStampBBox(geometry);

    case "TimeInterval":
      return computeTimeIntervalBBox(geometry);

    case "BoundingBox":
      return computeBoundingBoxBBox(geometry);

    case "Point":
      return bbox(geometry) as Box;

    case "MultiPoint":
      return bbox(geometry) as Box;

    case "LineString":
      return bbox(geometry) as Box;

    case "MultiLineString":
      return bbox(geometry) as Box;

    case "Polygon":
      return bbox(geometry) as Box;

    case "MultiPolygon":
      return bbox(geometry) as Box;

    default:
      throw Error(
        `Cannot compute bounding box of unknown geometry type ${type}`,
      );
  }
}
