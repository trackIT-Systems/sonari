import { useCallback, useMemo } from "react";
import api from "@/app/api";
import { SPECTROGRAM_CANVAS_DIMENSIONS } from "@/constants";
import { spectrogramCache } from "@/utils/spectrogram_cache";
import {
  calculateSpectrogramChunks,
  getVisibleChunks,
  getChunksToLoad,
  getDetailLevel,
  type Chunk,
} from "@/utils/chunks";
import useChunkImageLoader, {
  blobToImage,
  useDetailLevelFallback,
} from "./useChunkImageLoader";

import type {
  AnnotationTask,
  SpectrogramParameters,
  SpectrogramWindow,
} from "@/types";

/**
 * Spectrogram chunks are computed server side, so keep only a few requests in
 * flight. Together with the waveform requests this stays below the browser's
 * six connections per host, leaving room for audio and API calls.
 */
const MAX_CONCURRENT_SPECTROGRAM_REQUESTS = 3;

/**
 * Hook to manage loading of multiple spectrogram chunks with viewport-aware lazy loading.
 *
 * Chunks are loaded at a level of detail matching the viewport: zoomed out,
 * each image column spans several STFT hops (pooled on the backend), so the
 * number of requests stays proportional to the canvas width rather than the
 * visible duration.
 */
export default function useSpectrogramImages({
  task,
  samplerate,
  window,
  parameters,
  withSpectrogram,
  onAllSegmentsLoaded,
  canvasWidth = SPECTROGRAM_CANVAS_DIMENSIONS.width,
}: {
  task: AnnotationTask;
  samplerate: number;
  window: SpectrogramWindow;
  parameters: SpectrogramParameters;
  withSpectrogram: boolean;
  onAllSegmentsLoaded?: () => void;
  canvasWidth?: number;
}) {
  const windowSize = parameters.window_size_samples;
  const overlap = parameters.overlap_percent / 100;

  const level = getDetailLevel({
    viewportDuration: window.time.max - window.time.min,
    canvasWidth,
    windowSize,
    overlap,
    samplerate,
  });
  const decimation = 2 ** level;

  // Calculate all chunks for this recording at the current level of detail
  const allChunks = useMemo(() => {
    if (!withSpectrogram) return [];

    return calculateSpectrogramChunks({
      duration: task.end_time - task.start_time,
      windowSize,
      overlap,
      samplerate,
      decimation,
    });
  }, [
    task.start_time,
    task.end_time,
    windowSize,
    overlap,
    samplerate,
    decimation,
    withSpectrogram,
  ]);

  // Find chunks that are visible in current viewport
  const visibleChunks = useMemo(() => {
    if (!withSpectrogram || allChunks.length === 0) return [];

    // Adjust times relative to task start
    const viewportMin = window.time.min - task.start_time;
    const viewportMax = window.time.max - task.start_time;

    return getVisibleChunks(allChunks, viewportMin, viewportMax);
  }, [allChunks, window.time.min, window.time.max, task.start_time, withSpectrogram]);

  // Determine which chunks to load (visible + neighbors)
  const chunksToLoad = useMemo(() => {
    if (!withSpectrogram) return [];
    return getChunksToLoad(allChunks, visibleChunks);
  }, [allChunks, visibleChunks, withSpectrogram]);

  const { recording_id: recordingId, start_time: taskStartTime } = task;

  const load = useCallback(
    (chunk: Chunk, signal: AbortSignal) => {
      const segment = {
        min: chunk.buffer.min + taskStartTime,
        max: chunk.buffer.max + taskStartTime,
      };
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
        recordingId,
        { time: segment, freq: { min: 0, max: samplerate / 2 } },
        requestParameters,
        async () =>
          blobToImage(
            await api.spectrograms.getBlob({
              recording_id: recordingId,
              segment,
              parameters: requestParameters,
              signal,
            }),
          ),
        signal,
      );
    },
    [recordingId, taskStartTime, samplerate, parameters, windowSize, overlap, decimation],
  );

  const loaded = useChunkImageLoader({
    allChunks,
    visibleChunks,
    chunksToLoad,
    resetKey: parameters,
    enabled: withSpectrogram,
    load,
    maxConcurrent: MAX_CONCURRENT_SPECTROGRAM_REQUESTS,
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
