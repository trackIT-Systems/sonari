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

  const y = 50;

  const tooLeft = x < 50;
  const tooRight = x2 > SPECTROGRAM_CANVAS_DIMENSIONS.width - 50;

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
}: {
  annotation: SoundEventAnnotation;
  window: SpectrogramWindow;
}): Position {
  const geometry = annotation.geometry as TimeStamp;
  const {
    time: { min: startTime, max: endTime },
  } = window;
  const time = geometry.coordinates;

  if (time < startTime || time > endTime) {
    throw new Error("Annotation is not in the window");
  }

  const x = scaleTimeToWindow(time, window);

  // Get random height between 50 and dimensions.height - 50
  const y = 50 + Math.random() * (SPECTROGRAM_CANVAS_DIMENSIONS.height - 100);

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
): Position {
  const { geometry } = annotation;

  if (geometry.type === "TimeStamp") {
    return getTimeStampLabelPosition({
      annotation,
      window
    });
  }

  if (geometry.type === "TimeInterval") {
    return getTimeIntervalLabelPosition({
      annotation,
      window
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
    intersection,
    window,
  );

  const tooLeft = left < 50;
  const tooBottom = bottom > SPECTROGRAM_CANVAS_DIMENSIONS.height;
  const tooRight = right > SPECTROGRAM_CANVAS_DIMENSIONS.width;
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
        y: top + 5,
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
        y: top + 5,
        offset: 5,
        placement: "left",
      };

    case tooLeft:
      return {
        x: right,
        y: top + 5,
        offset: 5,
        placement: "right",
      };

    case tooRight:
      return {
        x: left,
        y: top + 5,
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
        y: top + 5,
        offset: 5,
        placement: "right",
      };

    default:
      return {
        x: right,
        y: top + 5,
        offset: 5,
        placement: "right",
      };
  }
}
