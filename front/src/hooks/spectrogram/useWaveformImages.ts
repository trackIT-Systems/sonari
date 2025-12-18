import { useEffect, useMemo, useState, useCallback } from "react";
import api from "@/app/api";
import { spectrogramCache } from "@/utils/spectrogram_cache";
import {
  calculateWaveformChunks,
  getVisibleChunks,
  type Chunk,
} from "@/utils/chunks";
import useSpectrogramChunksState from "./useSpectrogramChunksState";

import type {
  Recording,
  SpectrogramParameters,
  WaveformWindow,
} from "@/types";

interface ChunkWithImage {
  chunk: Chunk;
  image: HTMLImageElement | null;
  isLoading: boolean;
  isError: boolean;
}

/**
 * Hook to manage loading of multiple waveform chunks with viewport-aware lazy loading
 * Uses smaller chunks than spectrograms for faster progressive loading
 */
export default function useWaveformImages({
  recording,
  window,
  parameters,
  onAllSegmentsLoaded,
}: {
  recording: Recording;
  window: WaveformWindow;
  parameters: SpectrogramParameters;
  onAllSegmentsLoaded?: () => void;
}) {
  // Calculate all chunks for this recording (using waveform-optimized chunking)
  const allChunks = useMemo(() => {
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
    if (allChunks.length === 0) return [];

    const viewportMin = window.time.min;
    const viewportMax = window.time.max;

    return getVisibleChunks(allChunks, viewportMin, viewportMax);
  }, [allChunks, window.time.min, window.time.max]);

  // Determine which chunks to load 
  // For waveforms, only load visible chunks (no preloading) to minimize requests
  const chunksToLoad = useMemo(() => {
    return visibleChunks;
  }, [visibleChunks]);

  // Load chunks when they become needed
  useEffect(() => {
    const loadChunk = async (chunk: Chunk) => {
      const index = chunk.index;
      const state = chunkStates[index];

      // Skip if already loaded, loading, or errored
      if (state?.isReady || state?.isLoading || state?.isError) {
        return;
      }

      // Mark as loading
      startLoading([index]);

      try {
        const image = await spectrogramCache.getOrLoad(
          recording.id,
          {
            time: {
              min: chunk.buffer.min,
              max: chunk.buffer.max,
            },
            freq: { min: 0, max: 1 }, // Dummy freq for cache key
          },
          parameters,
          async () => {
            // Use authenticated API method to get blob
            const blob = await api.waveforms.getBlob({
              recording,
              segment: {
                min: chunk.buffer.min,
                max: chunk.buffer.max,
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
        console.error(`Failed to load waveform chunk ${index}:`, error);
        setError(index);
      }
    };

    const loadChunks = async () => {
      // Load all visible chunks in parallel
      await Promise.all(chunksToLoad.map(loadChunk));

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
    recording,
    parameters,
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
