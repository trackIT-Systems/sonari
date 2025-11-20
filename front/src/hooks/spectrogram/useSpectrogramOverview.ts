import { useEffect, useState, useCallback, useRef } from "react";
import api from "@/app/api";
import { spectrogramCache } from "@/utils/spectrogram_cache";

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

/**
 * Hook to load spectrogram overview for minimap purposes
 * Automatically uses chunked loading for long recordings (>180s)
 * and single image loading for shorter recordings
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
  const cancelledRef = useRef(false);

  // Determine if we should use chunked loading
  const duration = segment.time.max - segment.time.min;
  const useChunkedLoading = duration > CHUNK_THRESHOLD;

  useEffect(() => {
    if (!withSpectrogram) {
      setImage(null);
      setChunks([]);
      return;
    }

    cancelledRef.current = false;
    setIsLoading(true);
    setIsError(false);

    // Single image loading for short recordings
    const loadSingleImage = async () => {
      try {
        const loadedImage = await spectrogramCache.getOrLoad(
          recording_id,
          segment,
          parameters,
          async () => {
            const url = api.spectrograms.getUrl({
              recording_id,
              segment: {
                min: segment.time.min,
                max: segment.time.max,
              },
              parameters,
            });

            const response = await fetch(url);
            const size = parseInt(
              response.headers.get("content-length") || "0",
              10,
            );
            const blob = await response.blob();
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

        if (!cancelledRef.current) {
          setImage(loadedImage);
          setIsLoading(false);
        }
      } catch (error) {
        console.error("Failed to load overview spectrogram:", error);
        if (!cancelledRef.current) {
          setIsError(true);
          setIsLoading(false);
        }
      }
    };

    // Chunked loading for long recordings
    const loadChunkedImages = async () => {
      setChunks([]);
      const numChunks = Math.ceil(duration / CHUNK_DURATION);

      try {
        // Load chunks sequentially to avoid overwhelming the server
        for (let i = 0; i < numChunks; i++) {
          if (cancelledRef.current) break;

          const chunkStart = segment.time.min + i * CHUNK_DURATION;
          const chunkEnd = Math.min(
            segment.time.min + (i + 1) * CHUNK_DURATION,
            segment.time.max
          );

          const chunkSegment: SpectrogramWindow = {
            time: { min: chunkStart, max: chunkEnd },
            freq: segment.freq,
          };

          try {
            const loadedImage = await spectrogramCache.getOrLoad(
              recording_id,
              chunkSegment,
              parameters,
              async () => {
                const url = api.spectrograms.getUrl({
                  recording_id,
                  segment: {
                    min: chunkSegment.time.min,
                    max: chunkSegment.time.max,
                  },
                  parameters,
                });

                const response = await fetch(url);
                const size = parseInt(
                  response.headers.get("content-length") || "0",
                  10,
                );
                const blob = await response.blob();
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

            if (!cancelledRef.current) {
              setChunks((prev) => [
                ...prev,
                {
                  image: loadedImage,
                  timeRange: { min: chunkStart, max: chunkEnd },
                },
              ]);
            }
          } catch (error) {
            console.error(`Failed to load chunk ${i}:`, error);
            // Continue loading other chunks even if one fails
          }
        }

        if (!cancelledRef.current) {
          setIsLoading(false);
        }
      } catch (error) {
        console.error("Failed to load chunked overview spectrogram:", error);
        if (!cancelledRef.current) {
          setIsError(true);
          setIsLoading(false);
        }
      }
    };

    // Choose loading strategy based on duration
    if (useChunkedLoading) {
      loadChunkedImages();
    } else {
      loadSingleImage();
    }

    return () => {
      cancelledRef.current = true;
    };
  }, [recording_id, segment, parameters, withSpectrogram, useChunkedLoading, duration]);

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
