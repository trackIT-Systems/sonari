import { useCallback, useEffect, useMemo, useState } from "react";

import { DEFAULT_SPECTROGRAM_PARAMETERS } from "@/api/spectrograms";
import drawFrequencyAxis from "@/draw/freqAxis";
import drawTimeAxis from "@/draw/timeAxis";
import useSpectrogramImage from "@/hooks/spectrogram//useSpectrogramImage";
import useSpectrogramMotions from "@/hooks/spectrogram/useSpectrogramMotions";
import useSpectrogramKeyShortcuts from "@/hooks/spectrogram/useSpectrogramKeyShortcuts";
import {
  getInitialViewingWindow,
  adjustWindowToBounds,
  centerWindowOn,
  scaleWindow,
  shiftWindow,
} from "@/utils/windows";

import type { MotionMode } from "@/hooks/spectrogram/useSpectrogramMotions";
import type {
  Position,
  Recording,
  SpectrogramParameters,
  SpectrogramWindow,
} from "@/types";

/**
 * A function type representing the drawing function for a spectrogram.
 */
export type DrawFn = (ctx: CanvasRenderingContext2D) => void;

/**
 * Represents the state of a spectrogram, including parameters, bounds, and
 * viewport.
 */
export type SpectrogramState = {
  parameters: SpectrogramParameters;
  bounds: SpectrogramWindow;
  viewport: SpectrogramWindow;
  isLoading: boolean;
  isError: boolean;
  canDrag: boolean;
  canZoom: boolean;
};

/**
 * A set of controls for manipulating and interacting with a spectrogram.
 */
export type SpectrogramControls = {
  reset: () => void;
  drag: (window: SpectrogramWindow) => void;
  scale: ({ time , freq }: { time?: number; freq?: number }) => void;
  shift({ time , freq }: { time?: number; freq?: number }): void;
  centerOn: ({ time, freq }: { time?: number; freq?: number }) => void;
  setParameters: (parameters: SpectrogramParameters) => void;
  resetParameters: () => void;
  enableDrag: () => void;
  enableZoom: () => void;
  disable: () => void;
};

function hoverCallback(event: MouseEvent, canvas: HTMLCanvasElement, viewport: SpectrogramWindow) {
  if (event.currentTarget == null) {
    return;
  }

  const rect = canvas.getBoundingClientRect();

  // Calculate mouse coordinates relative to the canvas
  const mouseX = event.clientX - rect.left;
  const mouseY = event.clientY - rect.top;

  // Calculate the scaling factors
  const scaleX = (viewport.time.max - viewport.time.min) / canvas.width;
  const scaleY = (viewport.freq.max - viewport.freq.min) / canvas.height;

  // Translate canvas coordinates to custom bounding box coordinates
  const time = (mouseX * scaleX + viewport.time.min).toFixed(4);
  const freq = (((canvas.height - mouseY) * scaleY + viewport.freq.min) / 1000).toFixed(2); // The y-axis needs to be inverted...

  var popover = document.getElementById("popover-id");
  if (popover != null) {
    popover.innerText = `Time: ${time} s, Freq: ${freq} kHz`;
    popover.style.left = `${event.pageX + 5}px`;
    popover.style.top = `${event.pageY + 2}px`;
    popover.style.display = 'block';
  }
}

function drawPosition(ctx: CanvasRenderingContext2D, viewport: SpectrogramWindow) {
  // Create the popover element dynamically
  // This will be used to show the position of the mouse on the spectrogram
  var popover = document.getElementById("popover-id");
  if (popover == null) {
    popover = document.createElement('div');
  }
  popover.setAttribute('id', 'popover-id');
  popover.style.position = 'absolute';
  popover.style.background = 'rgba(28, 25, 23, 0.7)';
  popover.style.color = 'rgb(245, 245, 244)';
  popover.style.fontSize = '0.5em';
  popover.style.padding = '3px';
  popover.style.borderRadius = '5px';
  popover.style.pointerEvents = 'none';
  popover.style.display = 'none';
  document.body.appendChild(popover);

  // Create the callback function by referencing the actual callback.
  // We can not add the callback directly, because the addEventListener expects
  // a function with (event: MousEvent) => any, but we have to pass the canvas
  // and viewport as additional arguments.
  const hoverCallbackRef = (event: MouseEvent) => hoverCallback(event, ctx.canvas, viewport);

  // First, we remove mousemove event listeners to not create an infinit number of them
  // on multiple call event. Then we add it again and finally add a mousleave event
  // to hide the popover.
  ctx.canvas.removeEventListener('mousemove', hoverCallbackRef);
  ctx.canvas.addEventListener('mousemove', hoverCallbackRef);
  ctx.canvas.addEventListener('mouseleave', () => {
    if (popover != null) popover.style.display = 'none';
  });
}

/**
 * The `useSpectrogram` hook provides state, controls, and drawing functions
 * for managing and displaying a spectrogram of an audio recording.
 */
export default function useSpectrogram({
  recording,
  bounds,
  initial,
  dimensions,
  parameters: initialParameters = DEFAULT_SPECTROGRAM_PARAMETERS,
  onParameterChange,
  onModeChange,
  onDoubleClick,
  enabled = true,
  withShortcuts = true,
}: {
  recording: Recording;
  dimensions: { width: number; height: number };
  bounds?: SpectrogramWindow;
  initial?: SpectrogramWindow;
  parameters?: SpectrogramParameters;
  onParameterChange?: (parameters: SpectrogramParameters) => void;
  onModeChange?: (mode: MotionMode) => void;
  onDoubleClick?: (dblClickProps: { position: Position }) => void;
  enabled?: boolean;
  withShortcuts?: boolean;
}): {
  draw: DrawFn;
  props: React.HTMLAttributes<HTMLCanvasElement>;
} & SpectrogramState &
  SpectrogramControls {
  const initialBounds = useMemo<SpectrogramWindow>(() => {
    return (
      bounds ?? {
        time: { min: 0, max: recording.duration },
        freq: { min: 0, max: recording.samplerate / 2 },
      }
    );
  }, [bounds, recording]);

  const initialViewport = useMemo<SpectrogramWindow>(() => {
    return initial ?? getInitialViewingWindow({ 
      startTime: initialBounds.time.min,
      endTime: initialBounds.time.max,
      samplerate: recording.samplerate,
      parameters: initialParameters,
    });
  }, [initial, initialBounds, recording, initialParameters]);

  let lastViewport = useMemo<SpectrogramWindow>(() => {
    return initialViewport
  }, [initialViewport])

  const [parameters, setParameters] = useState<SpectrogramParameters>(
    validateParameters(initialParameters, recording),
  );
  const [viewport, setViewport] = useState<SpectrogramWindow>(
    initialViewport,
  );

  let hasZoomed = useMemo<boolean>(() => {
    return false;
  }, [])

  // NOTE: Need to update the viewport if the initial viewport
  // changes. This usually happens when the visualised clip
  // changes.
  useEffect(() => {
    if (initial != null) {
      setViewport(initial);
    }
  }, [initial]);

  const {
    draw: drawImage,
    isLoading,
    isError,
  } = useSpectrogramImage({
    recording,
    window: viewport,
    parameters,
  });

  const handleZoom = useCallback(
    (window: SpectrogramWindow) => {
      hasZoomed = true;
      setViewport(adjustWindowToBounds(window, initialBounds));
    },
    [initialBounds],
  );

  const handleDrag = useCallback(
    (window: SpectrogramWindow) => {
      const newViewPort = adjustWindowToBounds(window, initialBounds)
      if (!hasZoomed) {
        lastViewport = newViewPort;
      }
      setViewport(newViewPort);
    },
    [initialBounds],
  );

  const handleScale = useCallback(
    ({ time = 1, freq = 1 }: { time?: number; freq?: number }) => {
      setViewport((prev) =>
        adjustWindowToBounds(scaleWindow(prev, { time, freq }), initialBounds),
      );
    },
    [initialBounds],
  );

  const handleShift = useCallback(
    ({ time = 0, freq = 0 }: { time?: number; freq?: number }) => {
      setViewport((prev) =>
        adjustWindowToBounds(
          shiftWindow(prev, { time, freq }, false),
          initialBounds,
        ),
      );
    },
    [initialBounds],
  );

  const handleReset = useCallback(() => {
    if (hasZoomed) {
      hasZoomed = false;
      setViewport(lastViewport);
    } else {
      setViewport(initialViewport);
    }
  }, [initialViewport]);

  const handleCenterOn = useCallback(
    ({ time, freq }: { time?: number; freq?: number }) => {
      setViewport((prev) =>
        adjustWindowToBounds(
          centerWindowOn(prev, { time, freq }),
          initialBounds,
        ),
      );
    },
    [initialBounds],
  );

  const handleSetParameters = useCallback(
    (parameters: SpectrogramParameters) => {
      const validated = validateParameters(parameters, recording);
      onParameterChange?.(validated);
      setParameters(validated);
    },
    [recording, onParameterChange],
  );

  const handleResetParameters = useCallback(() => {
    setParameters(validateParameters(initialParameters, recording));
  }, [initialParameters, recording]);

  const {
    props,
    draw: drawMotions,
    canDrag,
    canZoom,
    enableDrag,
    enableZoom,
    disable,
  } = useSpectrogramMotions({
    viewport,
    onDrag: handleDrag,
    onZoom: handleZoom,
    onScrollMoveTime: handleShift,
    onScrollMoveFreq: handleShift,
    onScrollZoomTime: handleScale,
    onScrollZoomFreq: handleScale,
    onDoubleClick,
    onModeChange,
    dimensions,
    enabled,
  });

  // Create the drawing function
  const draw = useCallback<DrawFn>(
    (ctx) => {
      if (canDrag) {
        ctx.canvas.style.cursor = "crosshair";
      } else if (canZoom) {
        ctx.canvas.style.cursor = "crosshair";
      } else {
        ctx.canvas.style.cursor = "default";
      }
      drawImage(ctx, viewport);
      drawTimeAxis(ctx, viewport.time);
      drawFrequencyAxis(ctx, viewport.freq);
      drawMotions(ctx);
      drawPosition(ctx, viewport)
    },
    [drawImage, drawMotions, viewport, canDrag, canZoom],
  );

  useSpectrogramKeyShortcuts({
    onGoMove: enableDrag,
    onGoZoom: enableZoom,
    enabled: withShortcuts,
  })

  return {
    bounds: initialBounds,
    parameters,
    viewport,
    isLoading,
    isError,
    canDrag,
    canZoom,
    draw,
    props,
    reset: handleReset,
    drag: handleDrag,
    scale: handleScale,
    shift: handleShift,
    centerOn: handleCenterOn,
    setParameters: handleSetParameters,
    resetParameters: handleResetParameters,
    enableDrag,
    enableZoom,
    disable,
  };
}

function validateParameters(
  parameters: SpectrogramParameters,
  recording: Recording,
): SpectrogramParameters {
  const constrained: Partial<SpectrogramParameters> = {};

  // We need to constrain the maximum filtered, otherwise filtering
  // will fail
  if (parameters.high_freq != null) {
    // Use the samplerate of the recording, or the target sampling rate
    // if resampling is enabled.
    const samplerate = parameters.resample
      ? parameters.samplerate ?? recording.samplerate
      : recording.samplerate;

    // The maximum frequency is half the sampling rate, minus a bit
    // to avoid aliasing.
    const maxValue = Math.round((samplerate / 2) * 0.95);
    constrained.high_freq = Math.min(parameters.high_freq, maxValue);

    // Check that the low frequency is not higher than the high frequency.
    if (parameters.low_freq != null) {
      constrained.low_freq = Math.min(
        parameters.low_freq,
        parameters.high_freq - 1,
      );
    }
  }

  return { ...parameters, ...constrained };
}
