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
export type DrawFn = (
  ctx: CanvasRenderingContext2D,
  options?: { withAxes?: boolean }
) => void;

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
  moveLeft: () => void,
  moveRight: () => void,
  drag: (window: SpectrogramWindow) => void;
  scale: ({ time, freq }: { time?: number; freq?: number }) => void;
  shift({ time, freq }: { time?: number; freq?: number }): void;
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
  popover.style.fontSize = '0.75rem';
  popover.style.borderRadius = '6px';
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
  preload = true,
  withShortcuts = true,
  withSpectrogram,
  fixedAspectRatio,
  toggleFixedAspectRatio,
  onSegmentsLoaded,
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
  preload?: boolean;
  withShortcuts?: boolean;
  withSpectrogram: boolean;
  fixedAspectRatio: boolean,
  toggleFixedAspectRatio: () => void;
  onSegmentsLoaded: () => void;
}): {
  draw: DrawFn;
  props: React.HTMLAttributes<HTMLCanvasElement>;
} & SpectrogramState &
  SpectrogramControls {

  const [parameters, setParameters] = useState<SpectrogramParameters>(
    validateParameters(initialParameters, recording),
  );

  // Update internal parameters when external parameters change
  useEffect(() => {
    setParameters(validateParameters(initialParameters, recording));
  }, [initialParameters, recording]);

  // Create dynamic bounds that respond to parameter changes (especially resampling)
  const currentBounds = useMemo<SpectrogramWindow>(() => {
    if (bounds) return bounds;
    
    // Use the effective samplerate for frequency bounds calculation
    const effectiveSamplerate = parameters.resample
      ? parameters.samplerate ?? recording.samplerate
      : recording.samplerate;
    
    return {
      time: { min: 0, max: recording.duration },
      freq: { min: 0, max: effectiveSamplerate / 2 },
    };
  }, [bounds, recording.duration, recording.samplerate, parameters.resample, parameters.samplerate]);

  // Keep the initial bounds for compatibility with existing code
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
  const [viewport, setViewport] = useState<SpectrogramWindow>(
    initialViewport,
  );

  const zoom = useCallback(
    (oldViewport: SpectrogramWindow, in_out: string): SpectrogramWindow => {
      let zoom_factor = 1;
      if (in_out === "in" || in_out === "in_freq") {
        zoom_factor = 1 - ZOOM_FACTOR
      } else if (in_out === "out" || in_out === "out_freq") {
        zoom_factor = 1 + ZOOM_FACTOR
      } else {
        return oldViewport;
      }

      if (in_out === "in" || in_out === "out") {
        let duration = oldViewport.time.max - oldViewport.time.min;
        duration = duration * zoom_factor;
        duration = oldViewport.time.min + duration;

        const newViewPort = structuredClone(oldViewport);
        newViewPort.time.max = duration;
        lastViewportRef.current = newViewPort;

        return newViewPort;
      } else {
        let bandwidth = oldViewport.freq.max - oldViewport.freq.min;
        bandwidth = bandwidth * zoom_factor;
        bandwidth = oldViewport.freq.min + bandwidth;

        const newViewPort = structuredClone(oldViewport);
        newViewPort.freq.max = bandwidth;
        lastViewportRef.current = newViewPort;

        return newViewPort;
      }
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

  // Update viewport when bounds change due to resampling
  useEffect(() => {
    setViewport((prev) => {
      // Check if frequency bounds have changed significantly (indicating resampling change)
      const freqBoundsChanged = Math.abs(prev.freq.max - currentBounds.freq.max) > 1000; // 1kHz threshold
      
      if (freqBoundsChanged) {
        // When resampling changes, reset to show the full new frequency range
        const newViewport = {
          time: prev.time, // Keep time range
          freq: currentBounds.freq, // Use full new frequency range
        };
        
        const adjustedViewPort = adjustWindowToBounds(newViewport, currentBounds);
        lastViewportRef.current = adjustedViewPort;
        return adjustedViewPort;
      } else {
        // For other changes, just constrain to bounds
        const constrainedViewport = {
          time: {
            min: Math.max(prev.time.min, currentBounds.time.min),
            max: Math.min(prev.time.max, currentBounds.time.max),
          },
          freq: {
            min: Math.max(prev.freq.min, currentBounds.freq.min),
            max: Math.min(prev.freq.max, currentBounds.freq.max),
          },
        };
        
        const adjustedViewPort = adjustWindowToBounds(constrainedViewport, currentBounds);
        lastViewportRef.current = adjustedViewPort;
        return adjustedViewPort;
      }
    });
  }, [currentBounds]);

  const {
    draw: drawImage,
    isLoading,
    isError,
  } = useSpectrogramImage({
    recording,
    window: viewport,
    parameters,
    withSpectrogram,
    preload,
    onAllSegmentsLoaded: onSegmentsLoaded,
  });

  const handleZoomDrag = useCallback(
    (window: SpectrogramWindow) => {
      const newViewPort = adjustWindowToBounds(window, currentBounds);
      lastViewportRef.current = newViewPort;
      setViewport(newViewPort);
    },
    [currentBounds],
  );

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

  const handleZoomInFreq = useCallback(() => {
    handleZoomDrag(zoom(lastViewportRef.current, "in_freq"));
  },
    [handleZoomDrag, zoom, lastViewportRef],
  )

  const handleZoomOutFreq = useCallback(() => {
    handleZoomDrag(zoom(lastViewportRef.current, "out_freq"));
  },
    [handleZoomDrag, zoom, lastViewportRef],
  )

  const handleScale = useCallback(
    ({ time = 1, freq = 1 }: { time?: number; freq?: number }) => {
      setViewport((prev) =>
        adjustWindowToBounds(scaleWindow(prev, { time, freq }), currentBounds),
      );
    },
    [currentBounds],
  );

  const handleShift = useCallback(
    ({ time = 0, freq = 0 }: { time?: number; freq?: number }) => {
      setViewport((prev) =>
        adjustWindowToBounds(
          shiftWindow(prev, { time, freq }, false),
          currentBounds,
        ),
      );
    },
    [currentBounds],
  );

  const handleReset = useCallback(() => {
    const vprt = lastViewportRef.current
    if (vprt) {
      const vprtDuration = (vprt.time.max - vprt.time.min).toPrecision(4);
      const vprtBandwidth = (vprt.freq.max - vprt.freq.min).toPrecision(4);
      const initialViewportDuration = (initialViewport.time.max - initialViewport.time.min).toPrecision(4);
      const initialViewportBandwidth = (initialViewport.freq.max - initialViewport.freq.min).toPrecision(4);

      if (vprtDuration == initialViewportDuration && vprtBandwidth == initialViewportBandwidth) {
        lastViewportRef.current = initialViewport;
        handleZoomDrag(initialViewport);
      } else {
        const time_max_new = initialViewport.time.min + (initialViewport.time.max - initialViewport.time.min);
        lastViewportRef.current.time.max = lastViewportRef.current.time.min + time_max_new;
        lastViewportRef.current.freq.min = initialViewport.freq.min;
        lastViewportRef.current.freq.max = initialViewport.freq.max;
        handleZoomDrag(lastViewportRef.current);
      }
    }
  }, [initialViewport, handleZoomDrag]);

  const handleCenterOn = useCallback(
    ({ time, freq }: { time?: number; freq?: number }) => {
      setViewport((prev) =>
        adjustWindowToBounds(
          centerWindowOn(prev, { time, freq }),
          currentBounds,
        ),
      );
    },
    [currentBounds],
  );

  const handleSetParameters = useCallback(
    (newParameters: SpectrogramParameters) => {
      const validated = validateParameters(newParameters, recording);
      onParameterChange?.(validated);
      setParameters(validated);
    },
    [recording, onParameterChange],
  );  
  
  const handleResetParameters = useCallback(() => {
    const validated = validateParameters(initialParameters, recording);
    setParameters(validated);
    onParameterChange?.(validated);
  }, [initialParameters, recording, onParameterChange]);
  
  

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
    (ctx, options = { withAxes: true }) => {
      if (canDrag) {
        ctx.canvas.style.cursor = "crosshair";
      } else if (canZoom) {
        ctx.canvas.style.cursor = "crosshair";
      } else {
        ctx.canvas.style.cursor = "default";
      }
      drawImage(ctx, viewport);
      if (withSpectrogram && options.withAxes) {
        drawTimeAxis(ctx, viewport.time);
        drawFrequencyAxis(ctx, viewport.freq);
      }
      drawMotions(ctx);
      drawPosition(ctx, viewport)
    },
    [drawImage, drawMotions, viewport, canDrag, canZoom, withSpectrogram],
  );

  const handleMoveLeft = useCallback(() => {
    setViewport((prev) => {
      const timeWidth = prev.time.max - prev.time.min;
      const shiftAmount = timeWidth * 0.1; // 10% of current view width
      const newWindow = {
        ...prev,
        time: {
          min: prev.time.min - shiftAmount,
          max: prev.time.max - shiftAmount,
        }
      };
      const newViewPort = adjustWindowToBounds(newWindow, currentBounds);
      lastViewportRef.current = newViewPort;
      return newViewPort;
    });
  }, [currentBounds]);

  const handleMoveRight = useCallback(() => {
    setViewport((prev) => {
      const timeWidth = prev.time.max - prev.time.min;
      const shiftAmount = timeWidth * 0.1; // 10% of current view width
      const newWindow = {
        ...prev,
        time: {
          min: prev.time.min + shiftAmount,
          max: prev.time.max + shiftAmount,
        }
      };
      const newViewPort = adjustWindowToBounds(newWindow, currentBounds);
      lastViewportRef.current = newViewPort;
      return newViewPort;
    });
  }, [currentBounds]);



  const handleMoveUp = useCallback(() => {
    setViewport((prev) => {
      const bandwidth = prev.freq.max - prev.freq.min;
      const shiftAmount = bandwidth * 0.1; // 10% of current view width
      const newWindow = {
        ...prev,
        freq: {
          min: prev.freq.min + shiftAmount,
          max: prev.freq.max + shiftAmount,
        }
      };
      const newViewPort = adjustWindowToBounds(newWindow, currentBounds);
      lastViewportRef.current = newViewPort;
      return newViewPort;
    });
  }, [currentBounds]);

  const handleMoveDown = useCallback(() => {
    setViewport((prev) => {
      const bandwidth = prev.freq.max - prev.freq.min;
      const shiftAmount = bandwidth * 0.1; // 10% of current view width
      const newWindow = {
        ...prev,
        freq: {
          min: prev.freq.min - shiftAmount,
          max: prev.freq.max - shiftAmount,
        }
      };
      const newViewPort = adjustWindowToBounds(newWindow, currentBounds);
      lastViewportRef.current = newViewPort;
      return newViewPort;
    });
  }, [currentBounds]);

  useSpectrogramKeyShortcuts({
    onGoZoom: enableZoom,
    onZoomIn: handleZoomIn,
    onZoomOut: handleZoomOut,
    onZoomInFreq: handleZoomInFreq,
    onZoomOutFreq: handleZoomOutFreq,
    onResetZoom: handleReset,
    onToggleAspectRatio: toggleFixedAspectRatio,
    onMoveLeft: handleMoveLeft,
    onMoveRight: handleMoveRight,
    onMoveDown: handleMoveDown,
    onMoveUp: handleMoveUp,
    enabled: withShortcuts,
  });

  return {
    bounds: currentBounds,
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
    moveLeft: handleMoveLeft,
    moveRight: handleMoveRight,
    drag: handleZoomDrag,
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
