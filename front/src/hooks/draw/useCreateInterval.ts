import { useCallback, useEffect, useState } from "react";

import drawGeometry from "@/draw/geometry";
import { DEFAULT_INTERVAL_STYLE } from "@/draw/interval";
import { type Style } from "@/draw/styles";
import useWindowMotions from "@/hooks/window/useWindowMotions";
import { scaleGeometryToWindow } from "@/utils/geometry";

import type {
  Dimensions,
  Position,
  SpectrogramWindow,
  TimeInterval,
} from "@/types";

export default function useCreateInterval({
  window,
  enabled = true,
  style = DEFAULT_INTERVAL_STYLE,
  onCreate,
}: {
  window: SpectrogramWindow;
  enabled?: boolean;
  style?: Style;
  onCreate?: (interval: TimeInterval) => void;
}) {
  const [interval, setInterval] = useState<TimeInterval | null>(null);

  const handleMoveStart = useCallback(() => {
    setInterval(null);
  }, []);

  const handleMove = useCallback(
    ({ initial, shift }: { initial: Position; shift: Position }) => {
      const interval: TimeInterval = {
        type: "TimeInterval",
        coordinates: [
          Math.min(initial.time, initial.time + shift.time),
          Math.max(initial.time, initial.time + shift.time),
        ],
      };
      setInterval(interval);
    },
    [],
  );

  const handleMoveEnd = useCallback(() => {
    if (interval == null) return;
    onCreate?.(interval);
  }, [interval, onCreate]);

  const { props, isDragging } = useWindowMotions({
    enabled,
    window,
    onMoveStart: handleMoveStart,
    onMove: handleMove,
    onMoveEnd: handleMoveEnd,
  });

  useEffect(() => {
    if (!enabled && interval != null) setInterval(null);
  }, [enabled, interval]);

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      if (!enabled || !isDragging || interval == null) return;
      const scaled = scaleGeometryToWindow(interval, window);
      drawGeometry(ctx, scaled, style);
    },
    [enabled, interval, style, isDragging, window],
  );

  return {
    props,
    draw,
    isDragging,
  };
}
