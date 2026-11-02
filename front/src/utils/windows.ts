import type {
  Dimensions,
  Interval,
  SpectrogramParameters,
  SpectrogramWindow,
} from "@/types";
import { calculateHopDuration, calculateTimeFrames } from "./spectrogram_calculations";
import { SPECTROGRAM_CANVAS_DIMENSIONS } from "@/constants";

const STRETCH_FACTOR = 3

/**
 * Spectrogram Window System Documentation
 * ========================================
 * 
 * This file contains utilities for managing spectrogram windows. Understanding the
 * three key concepts is essential:
 * 
 * 1. **bounds**: The maximum navigable area
 *    - Defines the outer limits of where the window can be positioned
 *    - Typically set by annotation task boundaries and current spectrogram parameters
 *    - Example: A task might limit bounds to time range [10s, 20s] and freq range [0Hz, 48kHz]
 *    - The window is always constrained to stay within these bounds
 * 
 * 2. **window**: The currently visible window
 *    - What the user actually sees on screen at any given moment
 *    - User can zoom/pan this, but it will always be constrained to stay within bounds
 *    - Changes dynamically as user navigates the spectrogram
 *    - Example: User might be viewing time [12s, 14s] and freq [5kHz, 15kHz] within the bounds
 * 
 * 3. **initial**: The starting window position
 *    - Determines what portion of the bounds the user sees when component first renders
 *    - Calculated once at component mount based on parameters and context
 *    - Should provide a good initial view (not too zoomed in or out)
 *    - Example: For a 10s task, might show first 2s at full frequency range
 * 
 * Window vs. Bounds:
 * - Bounds are the "playing field" (what's allowed)
 * - Window is the "camera view" (what you see)
 * - The window moves and zooms within the bounds
 * 
 * When window resets:
 * - Parameter changes (resampling): Frequency range resets to show full spectrum
 * - Initial changes: Full window reset to new initial
 * - User reset action: Returns to initial window
 * 
 * When window is preserved:
 * - Normal zoom/pan operations
 * - Minor parameter tweaks (window size, hop size, etc.)
 * - Toggling visual settings
 */

/**
 * Calculate the initial window for a spectrogram.
 * 
 * This determines what the user sees when the spectrogram first loads using a
 * straightforward pixel-based approach:
 * 
 * 
 * The initial window is constrained by:
 * - Available task duration (won't exceed endTime - startTime)
 * - Available frequency range (won't exceed Nyquist frequency)
 * 
 * @param startTime - Start time of the available audio (usually task start)
 * @param endTime - End time of the available audio (usually task end)
 * @param samplerate - Sample rate of the audio in Hz
 * @returns The initial window showing a pixel-perfect view
 */
export function getInitialViewingWindow({
  startTime,
  endTime,
  samplerate,
  parameters,
}: {
  startTime: number;
  endTime: number;
  samplerate: number;
  parameters: SpectrogramParameters;
}): SpectrogramWindow {
  const taskDuration = endTime - startTime;
  const useParameterZoom =
    parameters.time_zoom_automatic === false &&
    parameters.time_zoom_duration_seconds != null &&
    parameters.time_zoom_duration_seconds >= 0.01;
  const duration = useParameterZoom
    ? Math.min(parameters.time_zoom_duration_seconds!, taskDuration)
    : getInitialDuration({
          interval: { min: startTime, max: endTime },
          samplerate,
          window_size_samples: parameters.window_size_samples,
          overlap_percent: parameters.overlap_percent,
        });
  return {
    time: { min: startTime, max: startTime + duration },
    freq: { min: 0, max: samplerate / 2 },
  };
}

/**
 * Get the ideal duration of a spectrogram window given the interval and
 * samplerate of the audio.
 * The ideal duration is a balance between:
 * - A large window that provides a good overview of the recording.
 * - A small window for which the spectrogram computation is fast.
 * Since the spectrogram computation is O(n^2) in the window size, we want to
 * avoid huge windows.
 */
function getInitialDuration({
  interval,
  samplerate,
  window_size_samples,
  overlap_percent,
}: {
  interval: Interval;
  samplerate: number;
  window_size_samples: number;
  overlap_percent: number;
}) {
  const duration = interval.max - interval.min;
  const hopDuration = calculateHopDuration(window_size_samples, overlap_percent, samplerate);
  const idealDuration = SPECTROGRAM_CANVAS_DIMENSIONS.width * hopDuration;
  return Math.min(duration, idealDuration);
}

/**
 * Expand a window so that it is drawn with the same time-to-frequency scale
 * ratio as a reference view.
 *
 * Two views only show the same shape when their pixels cover the same amount of
 * time per Hz. This stretches the window along whichever axis is "too zoomed
 * in" until that holds. The window is only ever grown, so everything that was
 * visible before stays visible.
 *
 * @param window - The window to adjust (e.g. a sound event plus some margin)
 * @param dimensions - Canvas the window is drawn on
 * @param reference - The window whose scale ratio should be matched
 * @param referenceDimensions - Canvas the reference window is drawn on
 */
export function matchWindowScaleRatio({
  window,
  dimensions,
  reference,
  referenceDimensions = SPECTROGRAM_CANVAS_DIMENSIONS,
}: {
  window: SpectrogramWindow;
  dimensions: Dimensions;
  reference: SpectrogramWindow;
  referenceDimensions?: Dimensions;
}): SpectrogramWindow {
  const duration = window.time.max - window.time.min;
  const bandwidth = window.freq.max - window.freq.min;
  const referenceDuration = reference.time.max - reference.time.min;
  const referenceBandwidth = reference.freq.max - reference.freq.min;

  if (
    duration <= 0 ||
    bandwidth <= 0 ||
    referenceDuration <= 0 ||
    referenceBandwidth <= 0
  ) {
    return window;
  }

  // Bandwidth per unit of duration that keeps both views at the same scale.
  const targetSlope =
    (referenceBandwidth / referenceDuration) *
    (referenceDimensions.width / referenceDimensions.height) *
    (dimensions.height / dimensions.width);

  const grown =
    bandwidth >= targetSlope * duration
      ? { duration: bandwidth / targetSlope, bandwidth }
      : { duration, bandwidth: targetSlope * duration };

  const timeCenter = (window.time.max + window.time.min) / 2;
  const freqCenter = (window.freq.max + window.freq.min) / 2;

  return {
    time: {
      min: timeCenter - grown.duration / 2,
      max: timeCenter + grown.duration / 2,
    },
    freq: {
      min: freqCenter - grown.bandwidth / 2,
      max: freqCenter + grown.bandwidth / 2,
    },
  };
}

/**
 * Compute the intersection of two intervals
 */
function intersectIntervals(
  interval1: Interval,
  interval2: Interval,
): Interval | null {
  const { min: min1, max: max1 } = interval1;
  const { min: min2, max: max2 } = interval2;

  const min = Math.max(min1, min2);
  const max = Math.min(max1, max2);

  if (min > max) return null;
  return { min, max };
}

/**
 * Compute the intersection of two spectrogram windows
 */
function intersectWindows(
  window1: SpectrogramWindow,
  window2: SpectrogramWindow,
): SpectrogramWindow | null {
  const timeIntersection = intersectIntervals(window1.time, window2.time);
  const freqIntersection = intersectIntervals(window1.freq, window2.freq);

  if (timeIntersection == null || freqIntersection == null) return null;
  return {
    time: timeIntersection,
    freq: freqIntersection,
  };
}

function getWindowDimensions(window: SpectrogramWindow): {
  time: number;
  freq: number;
} {
  return {
    time: window.time.max - window.time.min,
    freq: window.freq.max - window.freq.min,
  };
}

/**
 * Constrain a window window to stay within bounds.
 * 
 * This is the core constraint function that ensures the window never goes outside
 * the allowed bounds. It handles several cases:
 * 
 * 1. If window is too large for bounds: Centers it and clips to fit
 * 2. If window extends past bounds: Shifts it back inside
 * 3. If window is already within bounds: Returns it unchanged
 * 
 * The function preserves the window's duration and bandwidth (size) as much as
 * possible, only clipping when absolutely necessary.
 * 
 * This should be called every time the window changes to maintain the invariant
 * that window ⊆ bounds at all times.
 * 
 * @param window - The window window to constrain (what user wants to see)
 * @param bounds - The maximum allowed area (task boundaries + parameter constraints)
 * @returns A new window window that fits within the bounds
 * 
 * @example
 * // Window trying to go past bounds
 * const window = { time: {min: 15, max: 25}, freq: {min: 0, max: 10000} };
 * const bounds = { time: {min: 0, max: 20}, freq: {min: 0, max: 48000} };
 * const constrained = adjustWindowToBounds(window, bounds);
 * // Result: { time: {min: 10, max: 20}, freq: {min: 0, max: 10000} }
 * // (shifted left to stay within time bounds, freq unchanged as it fits)
 */
export function adjustWindowToBounds(
  window: SpectrogramWindow,
  bounds: SpectrogramWindow,
): SpectrogramWindow {
  const duration = window.time.max - window.time.min;
  const bandwidth = window.freq.max - window.freq.min;

  const centerTime = (window.time.max + window.time.min) / 2;
  const centerFreq = (window.freq.max + window.freq.min) / 2;

  const adjustedCenterTime = Math.min(
    Math.max(centerTime, bounds.time.min + duration / 2),
    bounds.time.max - duration / 2,
  );

  const adjustedCenterFreq = Math.min(
    Math.max(centerFreq, bounds.freq.min + bandwidth / 2),
    bounds.freq.max - bandwidth / 2,
  );

  const adjustedWindow = {
    time: {
      min: adjustedCenterTime - duration / 2,
      max: adjustedCenterTime + duration / 2,
    },
    freq: {
      min: adjustedCenterFreq - bandwidth / 2,
      max: adjustedCenterFreq + bandwidth / 2,
    },
  };

  return intersectWindows(adjustedWindow, bounds) ?? bounds;
}

export function shiftWindow(
  window: SpectrogramWindow,
  shiftBy: { time: number; freq: number },
  relative = true,
): SpectrogramWindow {
  let { time, freq } = shiftBy;

  if (relative) {
    const { time: timeDims, freq: freqDims } = getWindowDimensions(window);
    time *= timeDims;
    freq *= freqDims;
  }

  return {
    time: { min: window.time.min + time, max: window.time.max + time },
    freq: { min: window.freq.min + freq, max: window.freq.max + freq },
  };
}

export function centerWindowOn(
  window: SpectrogramWindow,
  { time, freq }: { time?: number; freq?: number },
): SpectrogramWindow {
  const width = window.time.max - window.time.min;
  const height = window.freq.max - window.freq.min;
  const timeMin = time != null ? time - width / 2 : window.time.min;
  const timeMax = time != null ? time + width / 2 : window.time.max;
  const freqMin = freq != null ? freq - height / 2 : window.freq.min;
  const freqMax = freq != null ? freq + height / 2 : window.freq.max;
  return {
    time: {
      min: timeMin,
      max: timeMax,
    },
    freq: {
      min: freqMin,
      max: freqMax,
    },
  };
}

export function scaleWindow(
  window: SpectrogramWindow,
  { time = 1, freq = 1 }: { time?: number; freq?: number } = {},
): SpectrogramWindow {
  const width = (window.time.max - window.time.min) * time;
  const height = (window.freq.max - window.freq.min) * freq;
  const timeCenter = (window.time.max + window.time.min) / 2;
  const freqCenter = (window.freq.max + window.freq.min) / 2;
  return {
    time: {
      min: timeCenter - width / 2,
      max: timeCenter + width / 2,
    },
    freq: {
      min: freqCenter - height / 2,
      max: freqCenter + height / 2,
    },
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.round(value), min), max);
}

export function getWindowPosition({
  width,
  height,
  window,
  bounds,
}: {
  width?: number;
  height?: number;
  window: SpectrogramWindow;
  bounds: SpectrogramWindow;
}): {
  left: number;
  width: number;
  top: number;
  height: number;
} {
  if (width == null || height == null) {
    return { left: 0, width: 0, top: 0, height: 0 };
  }

  const bottom =
    (bounds.freq.max - window.freq.min) / (bounds.freq.max - bounds.freq.min);
  const top =
    (bounds.freq.max - window.freq.max) / (bounds.freq.max - bounds.freq.min);
  const left =
    (window.time.min - bounds.time.min) / (bounds.time.max - bounds.time.min);
  const right =
    (window.time.max - bounds.time.min) / (bounds.time.max - bounds.time.min);
  return {
    top: clamp(top * height, 0, height),
    left: clamp(left * width, 0, width),
    height: clamp((bottom - top) * height, 0, height),
    width: clamp((right - left) * width, 0, width),
  };
}
