import { useEffect, useMemo, useState } from "react";
import api from "@/app/api";
import { spectrogramCache } from "@/utils/spectrogram_cache";
import {
  calculateSpectrogramChunks,
  getVisibleChunks,
  getChunksToLoad,
  type Chunk,
} from "@/utils/chunks";
import useSpectrogramChunksState from "./useSpectrogramChunksState";

import type {
  AnnotationTask,
  SpectrogramParameters,
  SpectrogramWindow,
} from "@/types";

interface ChunkWithImage {
  chunk: Chunk;
  image: HTMLImageElement | null;
  isLoading: boolean;
  isError: boolean;
}

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

  // Track loading state for each chunk
  const { chunks: chunkStates, setReady, setError, startLoading, setChunks } =
    useSpectrogramChunksState(allChunks);

  // Store loaded images
  const [images, setImages] = useState<Map<number, HTMLImageElement>>(new Map());

  // Reset chunk states and clear images when parameters change
  useEffect(() => {
    setChunks(allChunks);
    setImages(new Map());
  }, [parameters, allChunks, setChunks]);

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

  // Load chunks when they become needed
  useEffect(() => {
    if (!withSpectrogram) return;

    const loadChunks = async () => {
      const loadPromises = chunksToLoad.map(async (chunk) => {
        const index = chunk.index;
        const state = chunkStates[index];

        // Skip if already loaded, loading, or errored
        if (state?.isReady || state?.isLoading || state?.isError) {
          return;
        }

        // Mark as loading
        startLoading([index]);

        try {
          const chunkWindow: SpectrogramWindow = {
            time: {
              min: chunk.buffer.min + task.start_time,
              max: chunk.buffer.max + task.start_time,
            },
            freq: { min: 0, max: samplerate / 2 },
          };

          const image = await spectrogramCache.getOrLoad(
            task.recording_id,
            chunkWindow,
            parameters,
            async () => {
              // Use authenticated API method to get blob
              const blob = await api.spectrograms.getBlob({
                recording_id: task.recording_id,
                segment: {
                  min: chunk.buffer.min + task.start_time,
                  max: chunk.buffer.max + task.start_time,
                },
                parameters,
              });

              const size = blob.size;
              const objectUrl = URL.createObjectURL(blob);

              try {
                const img = new Image();
                await new Promise<void>((resolve, reject) => {
                  img.onload = async () => {
                    try {
                      await img.decode();
                      resolve();
                    } catch (err) {
                      reject(err);
                    }
                  };
                  img.onerror = reject;
                  img.src = objectUrl;
                });
                return { image: img, size };
              } finally {
                URL.revokeObjectURL(objectUrl);
              }
            },
          );

          // Update state and images
          setImages((prev) => {
            const next = new Map(prev);
            next.set(index, image);
            return next;
          });
          setReady(index);
        } catch (error) {
          console.error(`Failed to load chunk ${index}:`, error);
          setError(index);
        }
      });

      await Promise.all(loadPromises);

      // Check if all visible chunks are loaded
      const allVisibleLoaded = visibleChunks.every((chunk) => {
        const state = chunkStates[chunk.index];
        return state?.isReady;
      });

      if (allVisibleLoaded && visibleChunks.length > 0) {
        onAllSegmentsLoaded?.();
      }
    };

    loadChunks();
  }, [
    chunksToLoad,
    chunkStates,
    startLoading,
    setReady,
    setError,
    task.recording_id,
    task.start_time,
    parameters,
    samplerate,
    withSpectrogram,
    visibleChunks,
    onAllSegmentsLoaded,
  ]);

  // Combine chunk data with images and states for rendering
  // Return all chunks that have loaded images, not just visible ones
  // This prevents flickering during scroll by keeping previously loaded chunks visible
  const chunksWithImages: ChunkWithImage[] = useMemo(() => {
    return allChunks
      .filter((chunk) => images.has(chunk.index))
      .map((chunk) => {
        const state = chunkStates[chunk.index];
        return {
          chunk,
          image: images.get(chunk.index) || null,
          isLoading: state?.isLoading || false,
          isError: state?.isError || false,
        };
      });
  }, [allChunks, chunkStates, images]);

  return {
    chunks: chunksWithImages,
    isLoading: chunksWithImages.some((c) => c.isLoading),
    isError: chunksWithImages.some((c) => c.isError),
  };
}

