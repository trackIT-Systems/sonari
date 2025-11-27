import { useCallback, useEffect, useMemo, useState, useRef } from "react";

import { DEFAULT_SPECTROGRAM_PARAMETERS } from "@/api/spectrograms";
import drawFrequencyAxis from "@/draw/freqAxis";
import drawTimeAxis from "@/draw/timeAxis";
import { drawStitchedImage } from "@/draw/image";
import useSpectrogramImages from "@/hooks/spectrogram/useSpectrogramImages";
import useSpectrogramKeyShortcuts from "@/hooks/spectrogram/useSpectrogramKeyShortcuts";
import {
  adjustWindowToBounds,
  centerWindowOn,
  scaleWindow,
  shiftWindow,
} from "@/utils/windows";

import useSpectrogramMotions, { MotionMode } from "@/hooks/spectrogram/useSpectrogramMotions";
import type {
  AnnotationTask,
  Position,
  SpectrogramParameters,
  SpectrogramWindow,
} from "@/types";
import { ZOOM_FACTOR } from "@/constants";
import { drawLineString, DEFAULT_LINESTRING_STYLE } from "@/draw/linestring";
import { setFontStyle } from "@/draw/styles";

const FREQ_LINE_COLORS = [
  "rgb(248 113 113)", // red-400
  "rgb(251 146 60)",  // orange-400
  "rgb(250 204 21)",  // yellow-400
  "rgb(251 191 36)",  // amber-400
  "rgb(232 121 249)", // fuchsia-400
  "rgb(244 114 182)", // pink-400
  "rgb(251 113 133)", // rose-400
  "rgb(153 27 27)",   // red-800
  "rgb(154 52 18)",   // orange-800
  "rgb(133 77 14)",   // yellow-800
  "rgb(146 64 14)",   // amber-800
  "rgb(134 25 143)",  // fuchsia-800
  "rgb(157 23 77)",   // pink-800
  "rgb(159 18 57)",   // rose-800
];

/**
 * A function type representing the drawing function for a spectrogram.
 */
type DrawFn = (
  ctx: CanvasRenderingContext2D,
  options?: { withAxes?: boolean }
) => void;

/**
 * Represents the state of a spectrogram, including parameters, bounds, and
 * window.
 */
type SpectrogramState = {
  parameters: SpectrogramParameters;
  bounds: SpectrogramWindow;
  window: SpectrogramWindow;
  isLoading: boolean;
  isError: boolean;
  canDrag: boolean;
  canZoom: boolean;
};

/**
 * A set of controls for manipulating and interacting with a spectrogram.
 */
type SpectrogramControls = {
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

function hoverCallback(event: MouseEvent, canvas: HTMLCanvasElement, window: SpectrogramWindow) {
  if (event.currentTarget == null) {
    return;
  }

  const rect = canvas.getBoundingClientRect();

  // Calculate mouse coordinates relative to the canvas
  const mouseX = event.clientX - rect.left;
  const mouseY = event.clientY - rect.top;

  // Calculate the scaling factors
  const scaleX = (window.time.max - window.time.min) / canvas.width;
  const scaleY = (window.freq.max - window.freq.min) / canvas.height;

  // Translate canvas coordinates to custom bounding box coordinates
  const time = Math.round((mouseX * scaleX + window.time.min) * 1000);
  const freq = Math.round(((canvas.height - mouseY) * scaleY + window.freq.min) / 1000); // The y-axis needs to be inverted...

  var popover = document.getElementById("popover-id");
  if (popover != null) {
    popover.innerText = `${time}ms, ${freq} kHz`;
    popover.style.padding = '4px 8px';
    popover.style.display = 'block';
    
    const padding = 8;
    const offsetDistance = 120; // Distance from top-left corner to trigger offset
    
    // Check if mouse is near the top-left corner
    const isNearTopLeft = mouseX < offsetDistance && mouseY < offsetDistance;
    
    if (isNearTopLeft) {
      // Mouse is near top-left, offset the popover to avoid obscuring
      popover.style.left = `${event.pageX + 15}px`;
      popover.style.top = `${event.pageY + 15}px`;
    } else {
      // Default: always position in top-left corner
      popover.style.left = `${rect.left + padding}px`;
      popover.style.top = `${rect.top + padding}px`;
    }
  }
}

function drawPosition(ctx: CanvasRenderingContext2D, window: SpectrogramWindow) {
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
  // and window as additional arguments.
  const hoverCallbackRef = (event: MouseEvent) => hoverCallback(event, ctx.canvas, window);

  // First, we remove mousemove event listeners to not create an infinit number of them
  // on multiple call event. Then we add it again and finally add a mousleave event
  // to hide the popover.
  ctx.canvas.removeEventListener('mousemove', hoverCallbackRef);
  ctx.canvas.addEventListener('mousemove', hoverCallbackRef);
  ctx.canvas.addEventListener('mouseleave', () => {
    if (popover != null) popover.style.display = 'none';
  });
}

function drawFrequencyLines(
  ctx: CanvasRenderingContext2D,
  freqLines: number[],
  window: SpectrogramWindow,
  style = DEFAULT_LINESTRING_STYLE
) {
  const { height, width } = ctx.canvas;
  const { min: freqMin, max: freqMax } = window.freq;

  for (const freq of freqLines) {
    if (freq < freqMin || freq > freqMax) continue;

    const y = height * (1 - (freq - freqMin) / (freqMax - freqMin));

    // Draw the frequency line
    drawLineString(ctx, {
      type: "LineString",
      coordinates: [
        [0, y],
        [width, y],
      ],
    }, style);

    // Draw the frequency label
    ctx.save();

    setFontStyle(ctx, {fontSize: 10, fontColor: style.borderColor})
    
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    
    // Format frequency for display (convert Hz to kHz if >= 1000)
    const freqLabel = freq >= 1000 ? `${(freq / 1000).toFixed(0)} kHz` : `${freq} Hz`;
    
    // Position text slightly to the left and above the line
    const textX = 8; // 8 pixels from left edge
    const textY = y - 4; // 4 pixels above the line
    
    // Only draw label if it's within visible bounds
    if (textY > 0 && textY < height) {
      ctx.fillText(freqLabel, textX, textY);
    }
    
    ctx.restore();
  }
}


/**
 * The `useSpectrogram` hook provides state, controls, and drawing functions
 * for managing and displaying a spectrogram of an audio recording.
 */
export default function useSpectrogram({
  task,
  samplerate,
  bounds,
  initial: initialWindow,
  parameters: initialParameters,
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
  task: AnnotationTask;
  samplerate: number,
  bounds: SpectrogramWindow;
  /** The starting window position - required, must be provided by parent */
  initial: SpectrogramWindow;
  parameters: SpectrogramParameters;
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
    validateParameters(initialParameters, samplerate),
  );

  // Update internal parameters when external parameters change
  useEffect(() => {
    setParameters(validateParameters(initialParameters, samplerate));
  }, [initialParameters, samplerate]);

  /**
   * The currently visible window within the bounds.
   * User can zoom/pan this, but it will always be constrained to stay within bounds.
   */
  const [window, setWindow] = useState<SpectrogramWindow>(
    initialWindow,
  );

  /**
   * Helper to set window while ensuring it stays within bounds.
   * Always use this instead of setWindow directly to maintain constraints.
   */
  const setConstrainedWindow = useCallback((
    updater: SpectrogramWindow | ((prev: SpectrogramWindow) => SpectrogramWindow)
  ) => {
    setWindow((prev) => {
      const newWindow = typeof updater === 'function' ? updater(prev) : updater;
      return adjustWindowToBounds(newWindow, bounds);
    });
  }, [bounds]);

  // Handle significant parameter changes that affect frequency bounds (e.g., resampling)
  // When resampling changes, reset window to show full new frequency range
  useEffect(() => {
    const effectiveSamplerate = clampSamplerate(parameters, samplerate)
    
    const prevEffectiveSamplerate = window.freq.max * 2; // Reverse calculate from current window
    const freqBoundsChanged = Math.abs(effectiveSamplerate / 2 - prevEffectiveSamplerate) > 1000; // 1kHz threshold
    
    if (freqBoundsChanged) {
      // Reset frequency range to show full spectrum, preserve time range
      setConstrainedWindow((prev) => ({
        time: prev.time,
        freq: { min: 0, max: effectiveSamplerate / 2 },
      }));
    }
  }, [parameters, samplerate, setConstrainedWindow]); // eslint-disable-line react-hooks/exhaustive-deps
  // Note: window intentionally not in deps to avoid infinite loop

  const zoom = useCallback(
    (oldWindow: SpectrogramWindow, in_out: string): SpectrogramWindow => {
      let zoom_factor = 1;
      if (in_out === "in" || in_out === "in_freq") {
        zoom_factor = 1 - ZOOM_FACTOR
      } else if (in_out === "out" || in_out === "out_freq") {
        zoom_factor = 1 + ZOOM_FACTOR
      } else {
        return oldWindow;
      }

      if (in_out === "in" || in_out === "out") {
        let duration = oldWindow.time.max - oldWindow.time.min;
        duration = duration * zoom_factor;
        duration = oldWindow.time.min + duration;

        const newWindow = structuredClone(oldWindow);
        newWindow.time.max = duration;

        return newWindow;
      } else {
        let bandwidth = oldWindow.freq.max - oldWindow.freq.min;
        bandwidth = bandwidth * zoom_factor;
        bandwidth = oldWindow.freq.min + bandwidth;

        const newWindow = structuredClone(oldWindow);
        newWindow.freq.max = bandwidth;

        return newWindow;
      }
    },
    []
  );

  // NOTE: Need to update the window if the initial window
  // changes. This usually happens when the visualised clip
  // changes.
  useEffect(() => {
    if (initialWindow != null) {
      setConstrainedWindow(initialWindow);
    }
  }, [initialWindow, setConstrainedWindow]);


  const {
    chunks,
    isLoading,
    isError,
  } = useSpectrogramImages({
    task,
    samplerate,
    window,
    parameters,
    withSpectrogram,
    onAllSegmentsLoaded: onSegmentsLoaded,
  });

  const handleZoomDrag = useCallback(
    (newWindow: SpectrogramWindow) => {
      setConstrainedWindow(newWindow);
    },
    [setConstrainedWindow],
  );

  const handleZoomIn = useCallback(() => {
    setConstrainedWindow((prev) => zoom(prev, "in"));
  }, [zoom, setConstrainedWindow]);

  const handleZoomOut = useCallback(() => {
    setConstrainedWindow((prev) => zoom(prev, "out"));
  }, [zoom, setConstrainedWindow]);

  const handleZoomInFreq = useCallback(() => {
    setConstrainedWindow((prev) => zoom(prev, "in_freq"));
  }, [zoom, setConstrainedWindow]);

  const handleZoomOutFreq = useCallback(() => {
    setConstrainedWindow((prev) => zoom(prev, "out_freq"));
  }, [zoom, setConstrainedWindow]);

  const handleScale = useCallback(
    ({ time = 1, freq = 1 }: { time?: number; freq?: number }) => {
      setConstrainedWindow((prev) => scaleWindow(prev, { time, freq }));
    },
    [setConstrainedWindow],
  );

  const handleShift = useCallback(
    ({ time = 0, freq = 0 }: { time?: number; freq?: number }) => {
      setConstrainedWindow((prev) => shiftWindow(prev, { time, freq }, false));
    },
    [setConstrainedWindow],
  );

  const handleReset = useCallback(() => {
    setConstrainedWindow((prev) => {
      const vprtDuration = (prev.time.max - prev.time.min).toPrecision(4);
      const vprtBandwidth = (prev.freq.max - prev.freq.min).toPrecision(4);
      const initialWindowDuration = (initialWindow.time.max - initialWindow.time.min).toPrecision(4);
      const initialWindowBandwidth = (initialWindow.freq.max - initialWindow.freq.min).toPrecision(4);

      if (vprtDuration == initialWindowDuration && vprtBandwidth == initialWindowBandwidth) {
        return initialWindow;
      } else {
        const time_max_new = initialWindow.time.min + (initialWindow.time.max - initialWindow.time.min);
        return {
          time: {
            min: prev.time.min,
            max: prev.time.min + time_max_new,
          },
          freq: {
            min: initialWindow.freq.min,
            max: initialWindow.freq.max,
          },
        };
      }
    });
  }, [initialWindow, setConstrainedWindow]);

  const handleCenterOn = useCallback(
    ({ time, freq }: { time?: number; freq?: number }) => {
      setConstrainedWindow((prev) => centerWindowOn(prev, { time, freq }));
    },
    [setConstrainedWindow],
  );

  const handleSetParameters = useCallback(
    (newParameters: SpectrogramParameters) => {
      const validated = validateParameters(newParameters, samplerate);
      onParameterChange?.(validated);
      setParameters(validated);
    },
    [samplerate, onParameterChange],
  );

  const handleResetParameters = useCallback(() => {
    const validated = validateParameters(initialParameters, samplerate);
    setParameters(validated);
    onParameterChange?.(validated);
  }, [initialParameters, samplerate, onParameterChange]);



  const {
    props,
    draw: drawMotions,
    canDrag,
    canZoom,
    enableDrag,
    enableZoom,
    disable,
  } = useSpectrogramMotions({
    window,
    onDrag: handleZoomDrag,
    onZoom: handleZoomDrag,
    onScrollMoveTime: handleShift,
    onScrollMoveFreq: handleShift,
    onScrollZoomTime: handleScale,
    onScrollZoomFreq: handleScale,
    onDoubleClick,
    onModeChange,
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
      
      // Draw spectrogram chunks
      if (withSpectrogram) {
        // Convert viewport from absolute to relative coordinates
        // Chunks use relative coordinates (0 to task duration), so viewport must match
        const relativeViewport: SpectrogramWindow = {
          time: {
            min: window.time.min - task.start_time,
            max: window.time.max - task.start_time,
          },
          freq: window.freq,
        };
        
        drawStitchedImage({
          ctx,
          viewport: relativeViewport,
          chunks,
          samplerate,
        });
      } else {
        // Clear canvas if spectrogram is disabled
        ctx.fillStyle = "rgb(156 163 175)";
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      }
      
      if (withSpectrogram && options.withAxes) {
        drawTimeAxis(ctx, window.time);
        drawFrequencyAxis(ctx, window.freq);
      }
      drawMotions(ctx);
      drawPosition(ctx, window)
      if (parameters.freqLines && Array.isArray(parameters.freqLines)) {
        parameters.freqLines.forEach((freq, index) => {
          const color = FREQ_LINE_COLORS[index % FREQ_LINE_COLORS.length];
          drawFrequencyLines(ctx, [freq], window, {
            borderColor: color,
            borderWidth: 1.5,
            borderAlpha: 1,
          });
        });
      }

    },
    [chunks, drawMotions, window, canDrag, canZoom, withSpectrogram, parameters.freqLines, samplerate, task.start_time],
  );

  const handleMoveLeft = useCallback(() => {
    setConstrainedWindow((prev) => {
      const timeWidth = prev.time.max - prev.time.min;
      const shiftAmount = timeWidth * 0.1; // 10% of current view width
      return {
        ...prev,
        time: {
          min: prev.time.min - shiftAmount,
          max: prev.time.max - shiftAmount,
        }
      };
    });
  }, [setConstrainedWindow]);

  const handleMoveRight = useCallback(() => {
    setConstrainedWindow((prev) => {
      const timeWidth = prev.time.max - prev.time.min;
      const shiftAmount = timeWidth * 0.1; // 10% of current view width
      return {
        ...prev,
        time: {
          min: prev.time.min + shiftAmount,
          max: prev.time.max + shiftAmount,
        }
      };
    });
  }, [setConstrainedWindow]);



  const handleMoveUp = useCallback(() => {
    setConstrainedWindow((prev) => {
      const bandwidth = prev.freq.max - prev.freq.min;
      const shiftAmount = bandwidth * 0.1; // 10% of current view width
      return {
        ...prev,
        freq: {
          min: prev.freq.min + shiftAmount,
          max: prev.freq.max + shiftAmount,
        }
      };
    });
  }, [setConstrainedWindow]);

  const handleMoveDown = useCallback(() => {
    setConstrainedWindow((prev) => {
      const bandwidth = prev.freq.max - prev.freq.min;
      const shiftAmount = bandwidth * 0.1; // 10% of current view width
      return {
        ...prev,
        freq: {
          min: prev.freq.min - shiftAmount,
          max: prev.freq.max - shiftAmount,
        }
      };
    });
  }, [setConstrainedWindow]);

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
    bounds,
    parameters,
    window,
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

export function clampSamplerate(parameters: SpectrogramParameters, samplerate: number): number {
  return parameters.resample
      ? parameters.samplerate ?? samplerate
      : samplerate;
}

function validateParameters(
  parameters: SpectrogramParameters,
  samplerate: number,
): SpectrogramParameters {
  const constrained: Partial<SpectrogramParameters> = {};

  // We need to constrain the maximum filtered, otherwise filtering
  // will fail
  if (parameters.high_freq != null) {
    // Use the samplerate of the recording, or the target sampling rate
    // if resampling is enabled.
    
    const valid_samplerate = clampSamplerate(parameters, samplerate)

    // The maximum frequency is half the sampling rate, minus a bit
    // to avoid aliasing.
    const maxValue = Math.round((valid_samplerate / 2) * 0.95);
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
