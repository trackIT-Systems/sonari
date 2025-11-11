import { useCallback, useState } from "react";
import { mergeProps } from "react-aria";

import useSpectrogramDrag from "@/hooks/spectrogram/useSpectrogramDrag";
import useSpectrogramZoom from "@/hooks/spectrogram/useSpectrogramZoom";
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
  dimensions,
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
  dimensions: { width: number; height: number };
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

  const { dragProps } = useSpectrogramDrag({
    window,
    dimensions,
    onDragStart,
    onDrag,
    onDragEnd,
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
    dimensions,
    onZoom: handleOnZoom,
    fixedAspectRatio,
    enabled: enabled && motionMode === "zoom",
  });

  const handleTimeScroll = useCallback(
    ({ time }: { time?: number }) => {
      if (time == null) return;
      onScrollMoveTime?.({ time });
    },
    [onScrollMoveTime],
  );

  const { scrollProps: scrollMoveTimeProps } = useWindowScroll({
    window,
    dimensions,
    onScroll: handleTimeScroll,
    shift: true,
    enabled,
    relative: false,
  });

  const handleTimeZoom = useCallback(
    ({ timeRatio }: { timeRatio?: number }) => {
      if (timeRatio == null) return;
      onScrollZoomTime?.({ time: 1 + timeRatio });
    },
    [onScrollZoomTime],
  );

  const { scrollProps: scrollZoomTimeProps } = useWindowScroll({
    window,
    dimensions,
    onScroll: handleTimeZoom,
    shift: true,
    alt: true,
    enabled,
    relative: true,
  });

  const handleFreqScroll = useCallback(
    ({ freq }: { freq?: number }) => {
      if (freq == null) return;
      onScrollMoveFreq?.({ freq });
    },
    [onScrollMoveFreq],
  );

  const { scrollProps: scrollMoveFreqProps } = useWindowScroll({
    window,
    dimensions,
    onScroll: handleFreqScroll,
    ctrl: true,
    enabled,
    relative: false,
  });

  const handleFreqZoom = useCallback(
    ({ freqRatio }: { freqRatio?: number }) => {
      if (freqRatio == null) return;
      onScrollZoomFreq?.({ freq: 1 + freqRatio });
    },
    [onScrollZoomFreq],
  );

  const { scrollProps: scrollZoomFreqProps } = useWindowScroll({
    window,
    dimensions,
    onScroll: handleFreqZoom,
    ctrl: true,
    alt: true,
    enabled,
    relative: true,
  });

  const props = mergeProps(
    dragProps,
    zoomProps,
    scrollMoveTimeProps,
    scrollZoomTimeProps,
    scrollZoomFreqProps,
    scrollMoveFreqProps,
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
