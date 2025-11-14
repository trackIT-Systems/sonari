import { useCallback, useState, useMemo } from "react";

import drawBBox from "@/draw/bbox";
import useWindowMotions from "@/hooks/window/useWindowMotions";
import { scaleBBoxToWindow } from "@/utils/geometry";

import type { Position, SpectrogramWindow } from "@/types";

const VALID_STYLE = {
  fillAlpha: 0.3,
  fillColor: "yellow",
  borderWidth: 1,
  borderColor: "yellow",
  borderDash: [4, 4],
};

const INVALID_STYLE = {
  fillAlpha: 0.3,
  fillColor: "red",
  borderWidth: 1,
  borderColor: "red",
  borderDash: [4, 4],
};

const MIN_TIME_ZOOM = 0.001;
const MIN_FREQ_ZOOM = 1;

function validateWindow(window: SpectrogramWindow) {
  const { time, freq } = window;
  if (time.min < 0 || freq.min < 0) return false;
  return (
    time.max - time.min > MIN_TIME_ZOOM && freq.max - freq.min > MIN_FREQ_ZOOM
  );
}

function enforceAspectRatio(
  window: SpectrogramWindow,
  targetRatio: number,
  initial: Position,
  shift: Position
): SpectrogramWindow {
  const timeSpan = Math.abs(shift.time);
  const freqSpan = Math.abs(shift.freq);
  const currentRatio = timeSpan / freqSpan;

  if (currentRatio > targetRatio) {
    const newTimeSpan = freqSpan * targetRatio;
    const timeDirection = shift.time >= 0 ? 1 : -1;
    
    return {
      time: {
        min: Math.min(initial.time, initial.time + newTimeSpan * timeDirection),
        max: Math.max(initial.time, initial.time + newTimeSpan * timeDirection),
      },
      freq: {
        min: Math.min(initial.freq, initial.freq - shift.freq),
        max: Math.max(initial.freq, initial.freq - shift.freq),
      }
    };
  } else {
    const newFreqSpan = timeSpan / targetRatio;
    const freqDirection = shift.freq >= 0 ? 1 : -1;
    
    return {
      time: {
        min: Math.min(initial.time, initial.time + shift.time),
        max: Math.max(initial.time, initial.time + shift.time),
      },
      freq: {
        min: Math.min(initial.freq, initial.freq - newFreqSpan * freqDirection),
        max: Math.max(initial.freq, initial.freq - newFreqSpan * freqDirection),
      }
    };
  }
}

export default function useSpectrogramZoom({
  window,
  onZoom,
  fixedAspectRatio,
  enabled = true,
}: {
  window: SpectrogramWindow;
  onZoom?: (window: SpectrogramWindow) => void;
  fixedAspectRatio: boolean;
  enabled?: boolean;
}) {
  const [isValid, setIsValid] = useState(false);
  const [currentZoomWindow, setCurrentZoomWindow] = useState<SpectrogramWindow | null>(
    null,
  );

  // Calculate the target aspect ratio from the current window
  const targetRatio = useMemo(() => {
    if (!fixedAspectRatio) return null;
    const timeSpan = window.time.max - window.time.min;
    const freqSpan = window.freq.max - window.freq.min;
    return timeSpan / freqSpan;
  }, [window, fixedAspectRatio]);

  const handleMoveStart = useCallback(() => {
    setCurrentZoomWindow(null);
  }, []);

  const handleMove = useCallback(
    ({ initial, shift }: { initial: Position; shift: Position }) => {
      let window = {
        time: {
          min: Math.min(initial.time, initial.time + shift.time),
          max: Math.max(initial.time, initial.time + shift.time),
        },
        freq: {
          min: Math.min(initial.freq, initial.freq - shift.freq),
          max: Math.max(initial.freq, initial.freq - shift.freq),
        },
      };

      if (fixedAspectRatio && targetRatio !== null) {
        window = enforceAspectRatio(window, targetRatio, initial, shift);
      }

      setCurrentZoomWindow(window);
      setIsValid(validateWindow(window));
    },
    [fixedAspectRatio, targetRatio],
  );

  const handleMoveEnd = useCallback(() => {
    if (currentZoomWindow == null) return;
    if (isValid) {
      onZoom?.(currentZoomWindow);
    }
    setCurrentZoomWindow(null);
  }, [currentZoomWindow, isValid, onZoom]);

  const { props, isDragging } = useWindowMotions({
    enabled,
    window,
    onMoveStart: handleMoveStart,
    onMove: handleMove,
    onMoveEnd: handleMoveEnd,
  });

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      if (!enabled) return;

      if (currentZoomWindow == null) return;
      ctx.canvas.style.cursor = "nwse-resize";

      const bbox = scaleBBoxToWindow(
        [
          currentZoomWindow.time.min,
          currentZoomWindow.freq.min,
          currentZoomWindow.time.max,
          currentZoomWindow.freq.max,
        ],
        window,
      );

      const style = isValid ? VALID_STYLE : INVALID_STYLE;
      drawBBox(ctx, bbox, style);
    },
    [enabled, currentZoomWindow, window, isValid],
  );

  return {
    zoomProps: props,
    isDragging,
    isValid,
    draw,
  };
}
