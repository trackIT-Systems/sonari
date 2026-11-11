import { useCallback, useMemo } from "react";
import { WAVEFORM_CANVAS_DIMENSIONS } from "@/constants";
import { loadImage, type ImageRequest } from "@/utils/spectrogram_images";
import {
  calculateWaveformChunks,
  getDetailLevel,
  getVisibleChunks,
  type Chunk,
} from "@/utils/chunks";
import useChunkImageLoader, { useDetailLevelFallback } from "./useChunkImageLoader";

import type {
  Recording,
  SpectrogramParameters,
  WaveformWindow,
} from "@/types";

/** See MAX_CONCURRENT_SPECTROGRAM_REQUESTS in useSpectrogramImages. */
const MAX_CONCURRENT_WAVEFORM_REQUESTS = 2;

function waveformDetail(
  viewportDuration: number,
  samplerate: number,
  parameters: SpectrogramParameters,
  canvasWidth: number,
) {
  const level = getDetailLevel({
    viewportDuration,
    canvasWidth,
    windowSize: parameters.window_size_samples,
    overlap: parameters.overlap_percent / 100,
    samplerate,
  });
  return { level, decimation: 2 ** level };
}

/** The image request for one waveform chunk (times are absolute: waveforms cover the recording) */
export function getWaveformChunkRequest({
  recording,
  chunk,
  parameters,
  decimation,
}: {
  recording: Recording;
  chunk: Chunk;
  parameters: SpectrogramParameters;
  decimation: number;
}): ImageRequest {
  const segment = { min: chunk.buffer.min, max: chunk.buffer.max };
  // At coarser levels let the backend reduce the columns to what is drawn.
  const columnDuration =
    (1 - parameters.overlap_percent / 100)
    * (parameters.window_size_samples / recording.samplerate)
    * decimation;
  const requestParameters =
    decimation > 1
      ? {
          ...parameters,
          max_columns: Math.max(1, Math.round((segment.max - segment.min) / columnDuration)),
        }
      : parameters;
  return {
    kind: "waveform",
    recording,
    segment: { time: segment, freq: { min: 0, max: 1 } }, // Dummy freq for cache key
    parameters: requestParameters,
  };
}

/** The waveform chunk requests of a viewport (only visible chunks are loaded) */
export function getWaveformViewportRequests({
  recording,
  window,
  parameters,
  canvasWidth = WAVEFORM_CANVAS_DIMENSIONS.width,
}: {
  recording: Recording;
  window: WaveformWindow;
  parameters: SpectrogramParameters;
  canvasWidth?: number;
}): ImageRequest[] {
  const { decimation } = waveformDetail(
    window.time.max - window.time.min,
    recording.samplerate,
    parameters,
    canvasWidth,
  );
  const allChunks = calculateWaveformChunks({
    duration: recording.duration,
    windowSize: parameters.window_size_samples,
    overlap: parameters.overlap_percent / 100,
    samplerate: recording.samplerate,
    decimation,
  });
  return getVisibleChunks(allChunks, window.time.min, window.time.max).map((chunk) =>
    getWaveformChunkRequest({ recording, chunk, parameters, decimation }),
  );
}

/**
 * Hook to manage loading of multiple waveform chunks with viewport-aware lazy loading
 * Uses smaller chunks than spectrograms for faster progressive loading.
 * Like spectrograms, chunks are loaded at a level of detail matching the
 * viewport (see `getDetailLevel`).
 */
export default function useWaveformImages({
  recording,
  window,
  parameters,
  withSpectrogram,
  onAllSegmentsLoaded,
  canvasWidth = WAVEFORM_CANVAS_DIMENSIONS.width,
}: {
  recording: Recording;
  window: WaveformWindow;
  parameters: SpectrogramParameters;
  withSpectrogram: boolean;
  onAllSegmentsLoaded?: () => void;
  canvasWidth?: number;
}) {
  const windowSize = parameters.window_size_samples;
  const overlap = parameters.overlap_percent / 100;
  const samplerate = recording.samplerate;

  const { level, decimation } = waveformDetail(
    window.time.max - window.time.min,
    samplerate,
    parameters,
    canvasWidth,
  );

  // Calculate all chunks for this recording (using waveform-optimized chunking)
  const allChunks = useMemo(() => {
    if (!withSpectrogram) return [];

    return calculateWaveformChunks({
      duration: recording.duration,
      windowSize,
      overlap,
      samplerate,
      decimation,
    });
  }, [recording.duration, samplerate, windowSize, overlap, decimation, withSpectrogram]);

  // Find chunks that are visible in current viewport
  const visibleChunks = useMemo(() => {
    if (!withSpectrogram || allChunks.length === 0) return [];

    const viewportMin = window.time.min;
    const viewportMax = window.time.max;

    return getVisibleChunks(allChunks, viewportMin, viewportMax);
  }, [allChunks, window.time.min, window.time.max, withSpectrogram]);

  // For waveforms, only load visible chunks (no preloading) to minimize requests
  const chunksToLoad = visibleChunks;

  const load = useCallback(
    (chunk: Chunk, signal: AbortSignal) =>
      loadImage(getWaveformChunkRequest({ recording, chunk, parameters, decimation }), { signal }),
    [recording, parameters, decimation],
  );

  const loaded = useChunkImageLoader({
    allChunks,
    visibleChunks,
    chunksToLoad,
    resetKey: parameters,
    enabled: withSpectrogram,
    load,
    maxConcurrent: MAX_CONCURRENT_WAVEFORM_REQUESTS,
    onAllVisibleLoaded: onAllSegmentsLoaded,
  });

  // Keep what was on screen until the new level of detail has loaded
  const chunks = useDetailLevelFallback({
    level,
    resetKey: parameters,
    chunks: loaded.chunks,
    isLoading: loaded.isLoading,
  });

  return { ...loaded, chunks };
}
