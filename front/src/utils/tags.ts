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

function getTimeIntervalLabelPosition({
  annotation,
  window,
  dimensions,
}: {
  annotation: SoundEventAnnotation;
  window: SpectrogramWindow;
  dimensions: Dimensions;
}): Position {
  const geometry = annotation.geometry as TimeInterval;
  const {
    time: { min: startTime, max: endTime },
  } = window;
  const [start, end] = geometry.coordinates;

  if (end < startTime || start > endTime) {
    throw new Error("Annotation is not in the window");
  }

  const x = scaleTimeToWindow(start, window, dimensions.width);
  const x2 = scaleTimeToWindow(end, window, dimensions.width);

  const y = 50 * (dimensions.height - 100);

  const tooLeft = x < 50;
  const tooRight = x2 > dimensions.width - 50;

  if (tooLeft && tooRight) {
    return {
      x: x,
      y,
      offset: 5,
      placement: "right",
    };
  }

  if (tooLeft) {
    return {
      x: x2,
      y,
      offset: 5,
      placement: "left",
    };
  }

  if (tooRight) {
    return {
      x: x,
      y,
      offset: 5,
      placement: "left",
    };
  }

  return {
    x: x2,
    y,
    offset: 5,
    placement: "left",
  };
}

function getTimeStampLabelPosition({
  annotation,
  window,
  dimensions,
}: {
  annotation: SoundEventAnnotation;
  window: SpectrogramWindow;
  dimensions: Dimensions;
}): Position {
  const geometry = annotation.geometry as TimeStamp;
  const {
    time: { min: startTime, max: endTime },
  } = window;
  const time = geometry.coordinates;

  if (time < startTime || time > endTime) {
    throw new Error("Annotation is not in the window");
  }

  const x = scaleTimeToWindow(time, window, dimensions.width);

  // Get random height between 50 and dimensions.height - 50
  const y = 50 + Math.random() * (dimensions.height - 100);

  const tooLeft = x < 50;

  if (tooLeft) {
    return {
      x: x + 5,
      y,
      offset: 5,
      placement: "right",
    };
  }

  return {
    x: x - 5,
    y,
    offset: 5,
    placement: "left",
  };
}

export function getLabelPosition(
  annotation: SoundEventAnnotation,
  window: SpectrogramWindow,
  dimensions: Dimensions,
): Position {
  const { geometry } = annotation;

  if (geometry.type === "TimeStamp") {
    return getTimeStampLabelPosition({
      annotation,
      window,
      dimensions,
    });
  }

  if (geometry.type === "TimeInterval") {
    return getTimeIntervalLabelPosition({
      annotation,
      window,
      dimensions,
    });
  }

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
    dimensions,
    intersection,
    window,
  );

  const tooLeft = left < 50;
  const tooBottom = bottom > dimensions.height;
  const tooRight = right > dimensions.width;
  const tooTop = top < 50;

  switch (true) {
    case tooLeft && tooTop:
      return {
        x: right,
        y: bottom,
        offset: 5,
        placement: "right",
      };

    case tooLeft && tooBottom:
      return {
        x: right,
        y: top,
        offset: 5,
        placement: "right",
      };

    case tooRight && tooTop:
      return {
        x: left,
        y: bottom,
        offset: 5,
        placement: "left",
      };

    case tooRight && tooBottom:
      return {
        x: left,
        y: top,
        offset: 5,
        placement: "left",
      };

    case tooLeft:
      return {
        x: right,
        y: top,
        offset: 5,
        placement: "right",
      };

    case tooRight:
      return {
        x: left,
        y: top,
        offset: 5,
        placement: "left",
      };

    case tooTop:
      return {
        x: left,
        y: bottom,
        offset: 5,
        placement: "bottom",
      };

    case tooBottom:
      return {
        x: right,
        y: top,
        offset: 5,
        placement: "right",
      };

    default:
      return {
        x: right,
        y: top,
        offset: 5,
        placement: "right",
      };
  }
}
