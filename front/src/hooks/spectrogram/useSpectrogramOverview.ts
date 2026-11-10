import { useEffect, useState, useCallback, useMemo } from "react";

import { isAbortError, loadImage, type ImageRequest } from "@/utils/spectrogram_images";

import type {
  SpectrogramParameters,
  SpectrogramWindow,
} from "@/types";

const CHUNK_DURATION = 60; // seconds per chunk
const CHUNK_THRESHOLD = 180; // use chunked loading for recordings longer than this

interface ChunkData {
  image: HTMLImageElement;
  timeRange: { min: number; max: number };
}

/** The overview is coarse: a short window with almost no overlap is enough */
export function getOverviewParameters(parameters: SpectrogramParameters): SpectrogramParameters {
  return { ...parameters, window_size_samples: 128, overlap_percent: 1 };
}

/**
 * The images of an overview of `segment`, in loading order: one image, or one
 * per minute for segments longer than three minutes.
 */
export function getOverviewRequests({
  recording_id,
  segment,
  parameters,
}: {
  recording_id: number;
  segment: SpectrogramWindow;
  /** Overview parameters (see `getOverviewParameters`) */
  parameters: SpectrogramParameters;
}): ImageRequest[] {
  const duration = segment.time.max - segment.time.min;
  if (duration <= CHUNK_THRESHOLD) {
    return [{ kind: "spectrogram", recording_id, segment, parameters }];
  }
  const numChunks = Math.ceil(duration / CHUNK_DURATION);
  return Array.from({ length: numChunks }, (_, i) => ({
    kind: "spectrogram" as const,
    recording_id,
    segment: {
      time: {
        min: segment.time.min + i * CHUNK_DURATION,
        max: Math.min(segment.time.min + (i + 1) * CHUNK_DURATION, segment.time.max),
      },
      freq: segment.freq,
    },
    parameters,
  }));
}

/**
 * Hook to load spectrogram overview for minimap purposes
 * Automatically uses chunked loading for long recordings (>180s)
 * and single image loading for shorter recordings. Images load one after the
 * other through the shared image cache (see `spectrogram_images`).
 */
export default function useSpectrogramOverview({
  recording_id,
  segment,
  parameters,
  withSpectrogram,
}: {
  recording_id: number;
  segment: SpectrogramWindow;
  parameters: SpectrogramParameters;
  withSpectrogram: boolean;
}) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [chunks, setChunks] = useState<ChunkData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);

  const duration = segment.time.max - segment.time.min;
  const useChunkedLoading = duration > CHUNK_THRESHOLD;

  const requests = useMemo(
    () => getOverviewRequests({ recording_id, segment, parameters }),
    [recording_id, segment, parameters],
  );

  useEffect(() => {
    if (!withSpectrogram) {
      setImage(null);
      setChunks([]);
      return;
    }

    const controller = new AbortController();
    const { signal } = controller;
    setIsLoading(true);
    setIsError(false);
    setChunks([]);

    (async () => {
      let failed = false;
      // One after the other, to avoid overwhelming the server
      for (const request of requests) {
        if (signal.aborted) return;
        try {
          const loaded = await loadImage(request, { signal });
          if (signal.aborted) return;
          if (useChunkedLoading) {
            setChunks((prev) => [...prev, { image: loaded, timeRange: request.segment.time }]);
          } else {
            setImage(loaded);
          }
        } catch (error) {
          if (signal.aborted || isAbortError(error)) return;
          // Continue with the other chunks even if one fails
          console.error("Failed to load overview spectrogram:", error);
          failed = true;
        }
      }
      if (!signal.aborted) {
        setIsError(failed && !useChunkedLoading);
        setIsLoading(false);
      }
    })();

    return () => controller.abort();
  }, [requests, withSpectrogram, useChunkedLoading]);

  // Draw function that renders the loaded image(s)
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, window: SpectrogramWindow) => {
      if (!withSpectrogram) {
        // Draw placeholder background
        ctx.fillStyle = "rgb(156 163 175)";
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        return;
      }

      if (useChunkedLoading) {
        // Draw chunked spectrogram
        if (chunks.length === 0) {
          ctx.fillStyle = "rgb(156 163 175)";
          ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
          return;
        }

        const totalDuration = window.time.max - window.time.min;
        const canvasWidth = ctx.canvas.width;
        const canvasHeight = ctx.canvas.height;

        // Draw each chunk in its appropriate position
        chunks.forEach((chunk) => {
          const chunkStart = chunk.timeRange.min - window.time.min;
          const chunkDuration = chunk.timeRange.max - chunk.timeRange.min;

          // Calculate position and size on canvas
          const x = (chunkStart / totalDuration) * canvasWidth;
          const width = (chunkDuration / totalDuration) * canvasWidth;

          ctx.drawImage(
            chunk.image,
            x,
            0,
            width,
            canvasHeight
          );
        });
      } else {
        // Draw single image
        if (!image) {
          ctx.fillStyle = "rgb(156 163 175)";
          ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
          return;
        }

        ctx.drawImage(image, 0, 0, ctx.canvas.width, ctx.canvas.height);
      }
    },
    [image, chunks, withSpectrogram, useChunkedLoading],
  );

  return {
    draw,
    image,
    chunks,
    isLoading,
    isError,
    isChunked: useChunkedLoading,
    progress: useChunkedLoading ? chunks.length : undefined,
  };
}
