import { useCallback, useMemo } from "react";
import api from "@/app/api";
import { WAVEFORM_CANVAS_DIMENSIONS } from "@/constants";
import { spectrogramCache } from "@/utils/spectrogram_cache";
import {
  calculateWaveformChunks,
  getDetailLevel,
  getVisibleChunks,
  type Chunk,
} from "@/utils/chunks";
import useChunkImageLoader, {
  blobToImage,
  useDetailLevelFallback,
} from "./useChunkImageLoader";

import type {
  Recording,
  SpectrogramParameters,
  WaveformWindow,
} from "@/types";

/** See MAX_CONCURRENT_SPECTROGRAM_REQUESTS in useSpectrogramImages. */
const MAX_CONCURRENT_WAVEFORM_REQUESTS = 2;

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

  const level = getDetailLevel({
    viewportDuration: window.time.max - window.time.min,
    canvasWidth,
    windowSize,
    overlap,
    samplerate,
  });
  const decimation = 2 ** level;

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
    (chunk: Chunk, signal: AbortSignal) => {
      const segment = { min: chunk.buffer.min, max: chunk.buffer.max };
      // At coarser levels let the backend reduce the columns to what is drawn.
      const columnDuration = (1 - overlap) * (windowSize / samplerate) * decimation;
      const requestParameters =
        decimation > 1
          ? {
              ...parameters,
              max_columns: Math.max(
                1,
                Math.round((segment.max - segment.min) / columnDuration),
              ),
            }
          : parameters;
      return spectrogramCache.getOrLoad(
        recording.id,
        { time: segment, freq: { min: 0, max: 1 } }, // Dummy freq for cache key
        requestParameters,
        async () =>
          blobToImage(
            await api.waveforms.getBlob({
              recording,
              segment,
              parameters: requestParameters,
              signal,
            }),
          ),
        signal,
      );
    },
    [recording, parameters, windowSize, overlap, samplerate, decimation],
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
