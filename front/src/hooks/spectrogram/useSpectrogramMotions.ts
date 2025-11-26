import { useCallback, useState } from "react";
import { mergeProps } from "react-aria";

import useSpectrogramZoom from "@/hooks/spectrogram/useSpectrogramZoom";
import useWindowMotions from "@/hooks/window/useWindowMotions";
import useWindowScroll from "@/hooks/window/useWindowScroll";

import type { Position, SpectrogramWindow } from "@/types";

/**
 * The motion modes supported by the spectrogram motions.
 *
 * @description Either "drag", "zoom", or "idle".
 */
export type MotionMode = "drag" | "zoom" | "idle";

/**
 * The `useSpectrogramMotions` hook manages different motion modes (drag, zoom)
 * for a spectrogram.
 */
export default function useSpectrogramMotions({
  window,
  onDragStart,
  onDragEnd,
  onDrag,
  onZoom,
  onModeChange,
  onScrollMoveTime,
  onScrollMoveFreq,
  onScrollZoomTime,
  onScrollZoomFreq,
  onDoubleClick,
  fixedAspectRatio,
  enabled = true,
}: {
  window: SpectrogramWindow;
  onDoubleClick?: (dblClickProps: { position: Position }) => void;
  onDragStart?: () => void;
  onDrag?: (window: SpectrogramWindow) => void;
  onDragEnd?: () => void;
  onZoom?: (window: SpectrogramWindow) => void;
  onModeChange?: (mode: MotionMode) => void;
  onScrollMoveTime?: (props: { time: number }) => void;
  onScrollMoveFreq?: (props: { freq: number }) => void;
  onScrollZoomTime?: (props: { time: number }) => void;
  onScrollZoomFreq?: (props: { freq: number }) => void;
  fixedAspectRatio: boolean;
  enabled?: boolean;
}) {
  const [motionMode, setMotionMode] = useState<MotionMode>(
    enabled ? "drag" : "idle",
  );

  const [initialWindow, setInitialWindow] = useState(window);

  const handleDragMoveStart = useCallback(() => {
    if (!enabled || motionMode !== "drag") return;
    setInitialWindow(window);
    onDragStart?.();
  }, [onDragStart, window, enabled, motionMode]);

  const handleDragMove = useCallback(
    ({ shift }: { shift: Position }) => {
      if (!enabled || motionMode !== "drag") return;
      const newWindow = {
        time: {
          min: initialWindow.time.min - shift.time,
          max: initialWindow.time.max - shift.time,
        },
        freq: {
          min: initialWindow.freq.min + shift.freq,
          max: initialWindow.freq.max + shift.freq,
        },
      };
      onDrag?.(newWindow);
    },
    [onDrag, initialWindow, enabled, motionMode],
  );

  const handleDragMoveEnd = useCallback(() => {
    if (!enabled || motionMode !== "drag") return;
    setInitialWindow(window);
    onDragEnd?.();
  }, [onDragEnd, window, enabled, motionMode]);

  const { props: dragProps } = useWindowMotions({
    window,
    onMoveStart: handleDragMoveStart,
    onMove: handleDragMove,
    onMoveEnd: handleDragMoveEnd,
    onDoubleClick,
    enabled: enabled && motionMode === "drag",
  });

  const handleOnZoom = useCallback(
    (nextWindow: SpectrogramWindow) => {
      onZoom?.(nextWindow);
      setMotionMode("drag");
    },
    [onZoom],
  );

  const { zoomProps, draw } = useSpectrogramZoom({
    window,
    onZoom: handleOnZoom,
    fixedAspectRatio,
    enabled: enabled && motionMode === "zoom",
  });

  // Default scroll (no modifiers): deltaY → time, deltaX → freq (trackpad 2D navigation)
  const handleDefaultScroll = useCallback(
    ({ time, freq }: { time?: number; freq?: number }) => {
      if (time != null) {
        onScrollMoveTime?.({ time });
      }
      if (freq != null) {
        onScrollMoveFreq?.({ freq });
      }
    },
    [onScrollMoveTime, onScrollMoveFreq],
  );

  const { scrollProps: scrollDefaultProps } = useWindowScroll({
    window,
    onScroll: handleDefaultScroll,
    shift: false,
    ctrl: false,
    alt: false,
    enabled,
    relative: false,
  });

  // Alt + scroll: Move in frequency axis
  const handleFreqScroll = useCallback(
    ({ freq }: { freq?: number }) => {
      if (freq == null) return;
      onScrollMoveFreq?.({ freq });
    },
    [onScrollMoveFreq],
  );

  const { scrollProps: scrollMoveFreqProps } = useWindowScroll({
    window,
    onScroll: handleFreqScroll,
    shift: false,
    ctrl: false,
    alt: true,
    enabled,
    relative: false,
  });

  // Shift + scroll: Zoom on time axis
  const handleTimeZoom = useCallback(
    ({ timeRatio }: { timeRatio?: number }) => {
      if (timeRatio == null) return;
      onScrollZoomTime?.({ time: 1 + timeRatio });
    },
    [onScrollZoomTime],
  );

  const { scrollProps: scrollZoomTimeProps } = useWindowScroll({
    window,
    onScroll: handleTimeZoom,
    shift: true,
    ctrl: false,
    alt: false,
    enabled,
    relative: true,
  });

  // Ctrl + scroll: Zoom on frequency axis
  const handleFreqZoom = useCallback(
    ({ freqRatio }: { freqRatio?: number }) => {
      if (freqRatio == null) return;
      onScrollZoomFreq?.({ freq: 1 + freqRatio });
    },
    [onScrollZoomFreq],
  );

  const { scrollProps: scrollZoomFreqProps } = useWindowScroll({
    window,
    onScroll: handleFreqZoom,
    shift: false,
    ctrl: true,
    alt: false,
    enabled,
    relative: true,
  });

  const props = mergeProps(
    dragProps,
    zoomProps,
    scrollDefaultProps,
    scrollMoveFreqProps,
    scrollZoomTimeProps,
    scrollZoomFreqProps,
  );

  const handleEnableDrag = useCallback(() => {
    onModeChange?.("drag");
    setMotionMode("drag");
  }, [onModeChange]);

  const handleEnableZoom = useCallback(() => {
    onModeChange?.("zoom");
    setMotionMode("zoom");
  }, [onModeChange]);

  const handleDisable = useCallback(() => {
    onModeChange?.("idle");
    setMotionMode("idle");
  }, [onModeChange]);

  return {
    props,
    draw,
    canDrag: enabled && motionMode === "drag",
    canZoom: enabled && motionMode === "zoom",
    enabled,
    enableDrag: handleEnableDrag,
    enableZoom: handleEnableZoom,
    disable: handleDisable,
  } as const;
}
