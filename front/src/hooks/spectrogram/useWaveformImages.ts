import { useCallback, useMemo } from "react";
import api from "@/app/api";
import { spectrogramCache } from "@/utils/spectrogram_cache";
import {
  calculateWaveformChunks,
  getVisibleChunks,
  type Chunk,
} from "@/utils/chunks";
import useChunkImageLoader, { blobToImage } from "./useChunkImageLoader";

import type {
  Recording,
  SpectrogramParameters,
  WaveformWindow,
} from "@/types";

/** See MAX_CONCURRENT_SPECTROGRAM_REQUESTS in useSpectrogramImages. */
const MAX_CONCURRENT_WAVEFORM_REQUESTS = 2;

/**
 * Hook to manage loading of multiple waveform chunks with viewport-aware lazy loading
 * Uses smaller chunks than spectrograms for faster progressive loading
 */
export default function useWaveformImages({
  recording,
  window,
  parameters,
  withSpectrogram,
  onAllSegmentsLoaded,
}: {
  recording: Recording;
  window: WaveformWindow;
  parameters: SpectrogramParameters;
  withSpectrogram: boolean;
  onAllSegmentsLoaded?: () => void;
}) {
  // Calculate all chunks for this recording (using waveform-optimized chunking)
  const allChunks = useMemo(() => {
    if (!withSpectrogram) return [];

    const duration = recording.duration;
    const windowSize = parameters.window_size_samples;
    const overlap = parameters.overlap_percent / 100;

    return calculateWaveformChunks({
      duration,
      windowSize,
      overlap,
      samplerate: recording.samplerate,
    });
  }, [
    recording.duration,
    recording.samplerate,
    parameters.window_size_samples,
    parameters.overlap_percent,
    withSpectrogram,
  ]);

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
      return spectrogramCache.getOrLoad(
        recording.id,
        { time: segment, freq: { min: 0, max: 1 } }, // Dummy freq for cache key
        parameters,
        async () =>
          blobToImage(
            await api.waveforms.getBlob({
              recording,
              segment,
              parameters,
              signal,
            }),
          ),
        signal,
      );
    },
    [recording, parameters],
  );

  return useChunkImageLoader({
    allChunks,
    visibleChunks,
    chunksToLoad,
    resetKey: parameters,
    enabled: withSpectrogram,
    load,
    maxConcurrent: MAX_CONCURRENT_WAVEFORM_REQUESTS,
    onAllVisibleLoaded: onAllSegmentsLoaded,
  });
}
