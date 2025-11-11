import { useCallback, useEffect, useMemo, useState } from "react";

import useWindowHover from "@/hooks/window/useWindowHover";
import {
  isCloseToGeometry,
  scaleGeometryToWindow,
  scalePositionToWindow,
} from "@/utils/geometry";

import type {
  Dimensions,
  Position,
  SoundEventAnnotation,
  SpectrogramWindow,
} from "@/types";

export default function useHoveredAnnotations({
  window,
  dimensions,
  annotations,
  enabled: enabled = true,
}: {
  window: SpectrogramWindow;
  dimensions: Dimensions;
  annotations: SoundEventAnnotation[];
  enabled?: boolean;
}) {
  const [hoveredAnnotation, setHoveredAnnotation] =
    useState<SoundEventAnnotation | null>(null);

  const annotationsInWindow = useMemo(() => {
    if (!enabled) return [];
    const { min: startTime, max: endTime } = window.time;
    const { min: lowFreq, max: highFreq } = window.freq;
    return annotations.filter((annotation) => {
      const { geometry } = annotation;

      // Remove annotations without geometry
      if (geometry == null) return false;

      // In some cases it is easy to check if the geometry is
      // outside the current window. In such cases, we can avoid
      // checking if the mouse is close to the geometry.
      switch (geometry.type) {
        case "Point":
          // @ts-ignore
          const [x, y] = geometry.coordinates;
          return (
            x >= startTime && x <= endTime && y >= lowFreq && y <= highFreq
          );
        case "TimeStamp":
          const t = geometry.coordinates;
          // @ts-ignore
          return t >= startTime && t <= endTime;
        case "TimeInterval":
          // @ts-ignore
          const [t1, t2] = geometry.coordinates;
          return t2 >= startTime && t1 <= endTime;
        case "BoundingBox":
          // @ts-ignore
          const [x1, y1, x2, y2] = geometry.coordinates;
          return (
            x2 >= startTime && x1 <= endTime && y2 >= lowFreq && y1 <= highFreq
          );
      }

      return true;
    });
  }, [enabled, annotations, window]);

  const scaledGeometries = useMemo(() => {
    if (!enabled) return [];
    return annotationsInWindow.map(({ geometry }) => {
      return scaleGeometryToWindow(dimensions, geometry, window);
    });
  }, [enabled, annotationsInWindow, window, dimensions]);

  const handleOnHover = useCallback(
    (position: Position) => {
      if (!enabled) return;
      const { time, freq } = position;
      const [x, y] = scalePositionToWindow(
        dimensions,
        [time, freq],
        window,
      );

      const index = scaledGeometries.findIndex((geometry) => {
        return isCloseToGeometry([x, y], geometry);
      });

      if (index < 0) {
        setHoveredAnnotation(null);
        return;
      }

      const annotation = annotationsInWindow[index];
      setHoveredAnnotation(annotation ?? null);
    },
    [scaledGeometries, annotationsInWindow, window, dimensions, enabled],
  );

  useEffect(() => {
    if (!enabled && hoveredAnnotation != null) {
      setHoveredAnnotation(null);
    }
  }, [enabled, hoveredAnnotation]);

  const props = useWindowHover({
    enabled,
    window,
    dimensions,
    onHover: handleOnHover,
  });

  const clear = useCallback(() => setHoveredAnnotation(null), []);

  return {
    props,
    hoveredAnnotation,
    clear,
  };
}
