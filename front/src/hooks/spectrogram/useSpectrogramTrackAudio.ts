import { useCallback, useEffect } from "react";

import drawOnset from "@/draw/onset";
import { scaleTimeToWindow } from "@/utils/geometry";

import type { SpectrogramWindow } from "@/types";

export default function useSpectrogramTrackAudio({
  window,
  currentTime,
  isPlaying,
  onTimeChange,
  enabled = true,
}: {
  window: SpectrogramWindow;
  currentTime: number;
  isPlaying: boolean;
  onTimeChange?: (time: number) => void;
  enabled?: boolean;
}) {
  useEffect(() => {
    if (!enabled) return;
    if (isPlaying) onTimeChange?.(currentTime);
  }, [currentTime, isPlaying, onTimeChange, enabled]);

  const drawOnsetAt = useCallback(
    (ctx: CanvasRenderingContext2D, time: number) => {
      const x = scaleTimeToWindow(time, window);
      drawOnset(ctx, x);
    },
    [window],
  );

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      if (!isPlaying || !enabled) return;
      ctx.canvas.style.cursor = "not-allowed";
      drawOnsetAt(ctx, currentTime);
    },
    [currentTime, isPlaying, enabled, drawOnsetAt],
  );

  return {
    enabled: isPlaying && enabled,
    draw,
    drawOnsetAt,
  };
}