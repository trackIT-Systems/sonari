import { useCallback, useMemo } from "react";
import api from "@/app/api";
import { spectrogramCache } from "@/utils/spectrogram_cache";
import {
  calculateSpectrogramChunks,
  getVisibleChunks,
  getChunksToLoad,
  type Chunk,
} from "@/utils/chunks";
import useChunkImageLoader, { blobToImage } from "./useChunkImageLoader";

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
 * Hook to manage loading of multiple spectrogram chunks with viewport-aware lazy loading
 */
export default function useSpectrogramImages({
  task,
  samplerate,
  window,
  parameters,
  withSpectrogram,
  onAllSegmentsLoaded,
}: {
  task: AnnotationTask;
  samplerate: number;
  window: SpectrogramWindow;
  parameters: SpectrogramParameters;
  withSpectrogram: boolean;
  onAllSegmentsLoaded?: () => void;
}) {
  // Calculate all chunks for this recording
  const allChunks = useMemo(() => {
    if (!withSpectrogram) return [];

    const duration = task.end_time - task.start_time;
    const windowSize = parameters.window_size_samples;
    const overlap = parameters.overlap_percent / 100;

    return calculateSpectrogramChunks({
      duration,
      windowSize,
      overlap,
      samplerate,
    });
  }, [
    task.start_time,
    task.end_time,
    parameters.window_size_samples,
    parameters.overlap_percent,
    samplerate,
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
      return spectrogramCache.getOrLoad(
        recordingId,
        { time: segment, freq: { min: 0, max: samplerate / 2 } },
        parameters,
        async () =>
          blobToImage(
            await api.spectrograms.getBlob({
              recording_id: recordingId,
              segment,
              parameters,
              signal,
            }),
          ),
        signal,
      );
    },
    [recordingId, taskStartTime, samplerate, parameters],
  );

  return useChunkImageLoader({
    allChunks,
    visibleChunks,
    chunksToLoad,
    resetKey: parameters,
    enabled: withSpectrogram,
    load,
    maxConcurrent: MAX_CONCURRENT_SPECTROGRAM_REQUESTS,
    onAllVisibleLoaded: onAllSegmentsLoaded,
  });
}
