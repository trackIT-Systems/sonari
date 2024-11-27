import { useCallback, useEffect, useMemo, useState, useRef } from "react";

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
import { ZOOM_FACTOR } from "@/constants";

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
  zoom: (window: SpectrogramWindow) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  drag: (window: SpectrogramWindow) => void;
  scale: ({ time, freq }: { time?: number; freq?: number }) => void;
  shift({ time, freq }: { time?: number; freq?: number }): void;
  centerOn: ({ time, freq }: { time?: number; freq?: number }) => void;
  setParameters: (parameters: SpectrogramParameters) => void;
  resetParameters: () => void;
  enableDrag: () => void;
  enableZoom: () => void;
  disable: () => void;
  fixedAspectRatio: boolean;
  toggleFixedAspectRatio: () => void;
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
  withSpectrogram,
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
  withSpectrogram: boolean;
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

  const lastViewportRef = useRef<SpectrogramWindow>(initialViewport);
  useEffect(() => {
    lastViewportRef.current = initialViewport;
  }, [initialViewport]);

  const [parameters, setParameters] = useState<SpectrogramParameters>(
    validateParameters(initialParameters, recording),
  );
  const [viewport, setViewport] = useState<SpectrogramWindow>(
    initialViewport,
  );

  const lastConfPresetRef = useRef<string>(initialParameters.conf_preset);

  const zoom = useCallback(
    (oldViewport: SpectrogramWindow, in_out: string): SpectrogramWindow => {
      let zoom_factor = 1;
      if (in_out === "in") {
        zoom_factor = 1 - ZOOM_FACTOR
      } else if (in_out === "out") {
        zoom_factor = 1 + ZOOM_FACTOR
      } else {
        console.warn(`Zoom not supported ${in_out}`);
        return oldViewport;
      }

      let duration = oldViewport.time.max - oldViewport.time.min;
      duration = duration * zoom_factor;
      duration = oldViewport.time.min + duration;

      const newViewPort = structuredClone(oldViewport);
      newViewPort.time.max = duration;
      lastViewportRef.current = newViewPort;

      return newViewPort;
    },
    []
  );

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
    withSpectrogram,
  });

  const handleZoomDrag = useCallback(
    (window: SpectrogramWindow) => {
      const newViewPort = adjustWindowToBounds(window, initialBounds);
      lastViewportRef.current = newViewPort;
      setViewport(newViewPort);
    },
    [initialBounds],
  );

  const [fixedAspectRatio, setFixedAspectRatio] = useState(false);
  const toggleFixedAspectRatio = useCallback(() => {
    setFixedAspectRatio(prev => !prev);
  }, []);

  const handleZoomIn = useCallback(() => {
    handleZoomDrag(zoom(lastViewportRef.current, "in"));
  },
    [handleZoomDrag, zoom, lastViewportRef],
  )

  const handleZoomOut = useCallback(() => {
    handleZoomDrag(zoom(lastViewportRef.current, "out"));
  },
    [handleZoomDrag, zoom, lastViewportRef],
  )

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
    if (lastViewportRef.current) {
      const time_max_new = initialViewport.time.min + (initialViewport.time.max - initialViewport.time.min);
      lastViewportRef.current.time.max = lastViewportRef.current.time.min + time_max_new;
      lastViewportRef.current.freq.min = initialViewport.freq.min;
      lastViewportRef.current.freq.max = initialViewport.freq.max;
      handleZoomDrag(lastViewportRef.current);
    }
  }, [initialViewport, handleZoomDrag]);

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
      if (parameters.conf_preset != lastConfPresetRef.current) {
        lastConfPresetRef.current = parameters.conf_preset
        switch (parameters.conf_preset) {
          case "hsr":
            parameters.window_size = 0.00319;
            parameters.gamma = 1;
            parameters.min_dB = -140;
            break;
          case "hsrn":
            parameters.window_size = 0.00319;
            parameters.gamma = 1.5;
            parameters.min_dB = -90;
            break;
          case "lsr":
            parameters.window_size = 0.03;
            parameters.gamma = 1;
            parameters.min_dB = -140;
            break;
          case "lsrn":
            parameters.window_size = 0.03;
            parameters.gamma = 1.5;
            parameters.min_dB = -90;
            break;
        }
      }
      const validated = validateParameters(parameters, recording);
      onParameterChange?.(validated);
      setParameters(validated);
    },
    [recording, onParameterChange],
  );

  const handleResetParameters = useCallback(() => {
    lastConfPresetRef.current = initialParameters.conf_preset;
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
    onDrag: handleZoomDrag,
    onZoom: handleZoomDrag,
    onScrollMoveTime: handleShift,
    onScrollMoveFreq: handleShift,
    onScrollZoomTime: handleScale,
    onScrollZoomFreq: handleScale,
    onDoubleClick,
    onModeChange,
    dimensions,
    enabled,
    fixedAspectRatio,
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
      if (withSpectrogram) {
        drawTimeAxis(ctx, viewport.time);
        drawFrequencyAxis(ctx, viewport.freq);
      }
      drawMotions(ctx);
      drawPosition(ctx, viewport)
    },
    [drawImage, drawMotions, viewport, canDrag, canZoom, withSpectrogram],
  );

  useSpectrogramKeyShortcuts({
    onGoMove: enableDrag,
    onGoZoom: enableZoom,
    onZoomIn: handleZoomIn,
    onZoomOut: handleZoomOut,
    onToggleAspectRatio: toggleFixedAspectRatio,
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
    zoom: handleZoomDrag,
    zoomIn: handleZoomIn,
    zoomOut: handleZoomOut,
    drag: handleZoomDrag,
    scale: handleScale,
    shift: handleShift,
    centerOn: handleCenterOn,
    setParameters: handleSetParameters,
    resetParameters: handleResetParameters,
    enableDrag,
    enableZoom,
    disable,
    fixedAspectRatio,
    toggleFixedAspectRatio,
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
