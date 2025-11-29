import {
  bboxIntersection,
  computeGeometryBBox,
  scaleBBoxToWindow,
  scaleTimeToWindow,
} from "@/utils/geometry";

import type {
  Box,
  Dimensions,
  SoundEventAnnotation,
  SpectrogramWindow,
  Tag,
  TimeInterval,
  TimeStamp,
} from "@/types";
import { SPECTROGRAM_CANVAS_DIMENSIONS } from "@/constants";

export type TagElement = {
  tag: Tag;
  score?: number;
  onClick: () => void;
};

export type Position = {
  x: number;
  y: number;
  offset: number;
  placement: "left" | "right" | "bottom" | "top";
};

export type TagGroup = {
  annotation: SoundEventAnnotation;
  tags: TagElement[];
  position: Position;
  active?: boolean;
  disabled?: boolean;
  onAdd?: (tag: Tag) => void;
};

const OFFSET = 10;

/**
 * Helper function to apply offset to position based on placement direction
 * Works in canvas coordinate space (not scaled)
 * 
 * The tag div is always positioned with its top-left corner at (x, y) and extends rightward/downward.
 * The offset moves the anchor point away from the annotation edge:
 * - "right" placement: tag is on right side, move anchor right (add offset)
 * - "left" placement: tag is on left side, move anchor left (subtract offset)
 * - "bottom" placement: tag is on bottom, move anchor down (add offset)
 * - "top" placement: tag is on top, move anchor up (subtract offset)
 */
function applyOffset(
  x: number,
  y: number,
  offset: number,
  placement: "left" | "right" | "bottom" | "top"
): { x: number; y: number } {
  switch (placement) {
    case "right":
      return { x: x + offset, y };
    case "left":
      return { x: x - offset, y };
    case "bottom":
      return { x, y: y + offset };
    case "top":
      return { x, y: y - offset };
  }
}

function getTimeIntervalLabelPosition({
  annotation,
  window,
}: {
  annotation: SoundEventAnnotation;
  window: SpectrogramWindow;
}): Position {
  const geometry = annotation.geometry as TimeInterval;
  const {
    time: { min: startTime, max: endTime },
  } = window;
  const [start, end] = geometry.coordinates;

  if (end < startTime || start > endTime) {
    throw new Error("Annotation is not in the window");
  }

  const x = scaleTimeToWindow(start, window);
  const x2 = scaleTimeToWindow(end, window);

  // Use annotation ID to generate a consistent pseudo-random y offset
  // This prevents overlapping tags for neighboring intervals
  const hash = String(annotation.id).split('').reduce((acc: number, char: string) => {
    return ((acc << 5) - acc) + char.charCodeAt(0);
  }, 0);
  const randomFactor = (Math.abs(hash) % 100) / 100; // 0 to 1
  const minY = 50;
  const maxY = SPECTROGRAM_CANVAS_DIMENSIONS.height - 50;
  const y = minY + randomFactor * (maxY - minY);

  const tooLeft = x < 50;

  let baseX: number;
  let baseY: number = y;
  let placement: "left" | "right" | "bottom" | "top";

  if (tooLeft) {
    // Interval starts too far left, place tag on right edge
    baseX = x2;
    placement = "right";
  } else {
    // Normal case: place tag on right edge
    // Let the tag move off-screen naturally when the interval moves out
    baseX = x2;
    placement = "right";
  }

  // Apply offset before returning
  const { x: offsetX, y: offsetY } = applyOffset(baseX, baseY, OFFSET, placement);

  return {
    x: offsetX,
    y: offsetY,
    offset: OFFSET,
    placement,
  };
}


function getSpatialGeometryLabelPosition({
  annotation,
  window,
}: {
  annotation: SoundEventAnnotation;
  window: SpectrogramWindow;
}): Position {
  const { geometry } = annotation;

  const windowBBox: Box = [
    window.time.min,
    window.freq.min,
    window.time.max,
    window.freq.max,
  ];

  const bbox = computeGeometryBBox(geometry);
  const intersection = bboxIntersection(bbox, windowBBox);

  if (intersection === null) {
    throw new Error("Annotation is not in the window");
  }

  const [left, top, right, bottom] = scaleBBoxToWindow(
    intersection,
    window,
  );

  const tooLeft = left < 50;
  const tooBottom = bottom > SPECTROGRAM_CANVAS_DIMENSIONS.height;
  const tooRight = right > SPECTROGRAM_CANVAS_DIMENSIONS.width;
  const tooTop = top < 50;

  let baseX: number;
  let baseY: number;
  let placement: "left" | "right" | "bottom" | "top";

  switch (true) {
    case tooLeft && tooTop:
      baseX = right;
      baseY = bottom;
      placement = "right";
      break;

    case tooLeft && tooBottom:
      baseX = right;
      baseY = top;
      placement = "right";
      break;

    case tooRight && tooTop:
      baseX = left;
      baseY = bottom;
      placement = "left";
      break;

    case tooRight && tooBottom:
      baseX = left;
      baseY = top;
      placement = "left";
      break;

    case tooLeft:
      baseX = right;
      baseY = top;
      placement = "right";
      break;

    case tooRight:
      baseX = left;
      baseY = top;
      placement = "left";
      break;

    case tooTop:
      baseX = left;
      baseY = bottom;
      placement = "bottom";
      break;

    case tooBottom:
      baseX = right;
      baseY = top;
      placement = "right";
      break;

    default:
      baseX = right;
      baseY = top;
      placement = "right";
      break;
  }

  // Apply offset before returning
  const { x: offsetX, y: offsetY } = applyOffset(baseX, baseY, OFFSET, placement);

  return {
    x: offsetX,
    y: offsetY,
    offset: OFFSET,
    placement,
  };
}

export function getLabelPosition(
  annotation: SoundEventAnnotation,
  window: SpectrogramWindow,
): Position {
  const { geometry } = annotation;

  if (geometry.type === "TimeInterval") {
    return getTimeIntervalLabelPosition({
      annotation,
      window
    });
  }

  return getSpatialGeometryLabelPosition({
    annotation,
    window,
  });
}
