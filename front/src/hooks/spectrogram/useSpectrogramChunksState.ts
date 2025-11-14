import { useCallback, useState } from "react";
import type { Chunk } from "@/utils/chunks";

export type ChunkState = {
  /** The time interval covered by this chunk */
  interval: { min: number; max: number };
  /** The extended interval including buffer zones */
  buffer: { min: number; max: number };
  /** The index of this chunk */
  index: number;
  /** Whether the chunk image is loaded and ready */
  isReady: boolean;
  /** Whether the chunk is currently being loaded */
  isLoading: boolean;
  /** Whether an error occurred loading this chunk */
  isError: boolean;
};

export type ChunksState = {
  /** Array of chunk states */
  chunks: ChunkState[];
  /** Mark a chunk as having an error */
  setError: (index: number) => void;
  /** Mark a chunk as ready/loaded */
  setReady: (index: number) => void;
  /** Initialize chunks from chunk definitions */
  setChunks: (chunks: Chunk[]) => void;
  /** Mark multiple chunks as loading */
  startLoading: (indices: number[]) => void;
};

/**
 * Hook to manage the loading state of multiple spectrogram chunks
 */
export default function useSpectrogramChunksState(
  initialChunks: Chunk[] = [],
): ChunksState {
  const [state, setState] = useState<ChunkState[]>(
    initialChunks.map(({ interval, buffer, index }) => ({
      buffer,
      interval,
      index,
      isReady: false,
      isLoading: false,
      isError: false,
    })),
  );

  const setError = useCallback((index: number) => {
    setState((prev) => {
      const next = [...prev];
      if (index >= 0 && index < next.length) {
        next[index] = {
          ...next[index],
          isError: true,
          isLoading: false,
          isReady: false,
        };
      }
      return next;
    });
  }, []);

  const setReady = useCallback((index: number) => {
    setState((prev) => {
      const next = [...prev];
      if (index >= 0 && index < next.length) {
        next[index] = {
          ...next[index],
          isReady: true,
          isLoading: false,
          isError: false,
        };
      }
      return next;
    });
  }, []);

  const startLoading = useCallback((indices: number[]) => {
    setState((prev) => {
      const next = [...prev];
      indices.forEach((index) => {
        if (index >= 0 && index < next.length) {
          next[index] = {
            ...next[index],
            isLoading: true,
          };
        }
      });
      return next;
    });
  }, []);

  const setChunks = useCallback((chunks: Chunk[]) => {
    setState(
      chunks.map(({ interval, buffer, index }) => ({
        interval,
        buffer,
        index,
        isReady: false,
        isLoading: false,
        isError: false,
      })),
    );
  }, []);

  return {
    chunks: state,
    setError,
    setReady,
    startLoading,
    setChunks,
  };
}

