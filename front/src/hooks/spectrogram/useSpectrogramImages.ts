import { useCallback, useMemo } from "react";
import { SPECTROGRAM_CANVAS_DIMENSIONS } from "@/constants";
import {
  calculateSpectrogramChunks,
  getVisibleChunks,
  getChunksToLoad,
  getDetailLevel,
  type Chunk,
} from "@/utils/chunks";
import { loadImage, type ImageRequest } from "@/utils/spectrogram_images";
import useChunkImageLoader, { useDetailLevelFallback } from "./useChunkImageLoader";

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

type ChunkTask = Pick<AnnotationTask, "recording_id" | "start_time" | "end_time">;

/**
 * Detail level of a task's spectrogram for a viewport duration: each image
 * column spans `decimation` = 2^level STFT hops.
 */
export function getSpectrogramDetail({
  viewportDuration,
  samplerate,
  windowSize,
  overlap,
  canvasWidth = SPECTROGRAM_CANVAS_DIMENSIONS.width,
}: {
  viewportDuration: number;
  samplerate: number;
  windowSize: number;
  /** Fraction (0-1) */
  overlap: number;
  canvasWidth?: number;
}) {
  const level = getDetailLevel({ viewportDuration, canvasWidth, windowSize, overlap, samplerate });
  return { level, decimation: 2 ** level };
}

/** Chunk layout of a task's spectrogram; chunk times are relative to the task start */
export function getSpectrogramChunks({
  duration,
  samplerate,
  windowSize,
  overlap,
  decimation,
}: {
  duration: number;
  samplerate: number;
  windowSize: number;
  overlap: number;
  decimation: number;
}): Chunk[] {
  return calculateSpectrogramChunks({ duration, windowSize, overlap, samplerate, decimation });
}

/** The image request for one chunk of `getSpectrogramChunks` */
export function getSpectrogramChunkRequest({
  task,
  chunk,
  samplerate,
  parameters,
  decimation,
}: {
  task: ChunkTask;
  chunk: Chunk;
  samplerate: number;
  parameters: SpectrogramParameters;
  decimation: number;
}): ImageRequest {
  const segment = {
    min: chunk.buffer.min + task.start_time,
    max: chunk.buffer.max + task.start_time,
  };
  // At coarser levels let the backend reduce the columns to what is drawn.
  const columnDuration =
    (1 - parameters.overlap_percent / 100) * (parameters.window_size_samples / samplerate) * decimation;
  const requestParameters =
    decimation > 1
      ? {
          ...parameters,
          max_columns: Math.max(1, Math.round((segment.max - segment.min) / columnDuration)),
        }
      : parameters;
  return {
    kind: "spectrogram",
    recording_id: task.recording_id,
    segment: { time: segment, freq: { min: 0, max: samplerate / 2 } },
    parameters: requestParameters,
  };
}

/**
 * The chunk requests of a viewport, in the order they are loaded: visible
 * chunks first (closest to the centre first), then their neighbours.
 */
export function getSpectrogramViewportRequests({
  task,
  window,
  samplerate,
  parameters,
  canvasWidth,
}: {
  task: ChunkTask;
  window: SpectrogramWindow;
  samplerate: number;
  parameters: SpectrogramParameters;
  canvasWidth?: number;
}): { visible: ImageRequest[]; neighbours: ImageRequest[] } {
  const windowSize = parameters.window_size_samples;
  const overlap = parameters.overlap_percent / 100;
  const { decimation } = getSpectrogramDetail({
    viewportDuration: window.time.max - window.time.min,
    samplerate,
    windowSize,
    overlap,
    canvasWidth,
  });
  const allChunks = getSpectrogramChunks({
    duration: task.end_time - task.start_time,
    samplerate,
    windowSize,
    overlap,
    decimation,
  });
  const visibleChunks = getVisibleChunks(
    allChunks,
    window.time.min - task.start_time,
    window.time.max - task.start_time,
  );
  const visibleIndices = new Set(visibleChunks.map((chunk) => chunk.index));
  const centre = visibleChunks.length > 0
    ? (visibleChunks[0].index + visibleChunks[visibleChunks.length - 1].index) / 2
    : 0;
  const toRequest = (chunk: Chunk) =>
    getSpectrogramChunkRequest({ task, chunk, samplerate, parameters, decimation });
  return {
    visible: [...visibleChunks]
      .sort((a, b) => Math.abs(a.index - centre) - Math.abs(b.index - centre))
      .map(toRequest),
    neighbours: getChunksToLoad(allChunks, visibleChunks)
      .filter((chunk) => !visibleIndices.has(chunk.index))
      .map(toRequest),
  };
}

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
  const { recording_id: recordingId, start_time: taskStartTime, end_time: taskEndTime } = task;
  const windowSize = parameters.window_size_samples;
  const overlap = parameters.overlap_percent / 100;

  const { level, decimation } = getSpectrogramDetail({
    viewportDuration: window.time.max - window.time.min,
    samplerate,
    windowSize,
    overlap,
    canvasWidth,
  });

  // Calculate all chunks for this recording at the current level of detail
  const allChunks = useMemo(() => {
    if (!withSpectrogram) return [];
    return getSpectrogramChunks({
      duration: taskEndTime - taskStartTime,
      samplerate,
      windowSize,
      overlap,
      decimation,
    });
  }, [taskStartTime, taskEndTime, windowSize, overlap, samplerate, decimation, withSpectrogram]);

  // Find chunks that are visible in current viewport
  const visibleChunks = useMemo(() => {
    if (!withSpectrogram || allChunks.length === 0) return [];

    // Adjust times relative to task start
    const viewportMin = window.time.min - taskStartTime;
    const viewportMax = window.time.max - taskStartTime;

    return getVisibleChunks(allChunks, viewportMin, viewportMax);
  }, [allChunks, window.time.min, window.time.max, taskStartTime, withSpectrogram]);

  // Determine which chunks to load (visible + neighbors)
  const chunksToLoad = useMemo(() => {
    if (!withSpectrogram) return [];
    return getChunksToLoad(allChunks, visibleChunks);
  }, [allChunks, visibleChunks, withSpectrogram]);

  const load = useCallback(
    (chunk: Chunk, signal: AbortSignal) =>
      loadImage(
        getSpectrogramChunkRequest({
          task: { recording_id: recordingId, start_time: taskStartTime, end_time: taskEndTime },
          chunk,
          samplerate,
          parameters,
          decimation,
        }),
        { signal },
      ),
    [recordingId, taskStartTime, taskEndTime, samplerate, parameters, decimation],
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
