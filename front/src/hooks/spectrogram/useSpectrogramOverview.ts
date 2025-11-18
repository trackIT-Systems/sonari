import { useEffect, useState, useCallback } from "react";
import api from "@/app/api";
import { spectrogramCache } from "@/utils/spectrogram_cache";

import type {
  SpectrogramParameters,
  SpectrogramWindow,
} from "@/types";

/**
 * Simple hook to load a single low-resolution spectrogram image for overview/minimap purposes
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
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    if (!withSpectrogram) {
      setImage(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setIsError(false);

    const loadImage = async () => {
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

        if (!cancelled) {
          setImage(loadedImage);
          setIsLoading(false);
        }
      } catch (error) {
        console.error("Failed to load overview spectrogram:", error);
        if (!cancelled) {
          setIsError(true);
          setIsLoading(false);
        }
      }
    };

    loadImage();

    return () => {
      cancelled = true;
    };
  }, [recording_id, segment, parameters, withSpectrogram]);

  // Draw function that renders the loaded image
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, window: SpectrogramWindow) => {
      if (!image || !withSpectrogram) {
        // Draw placeholder background
        ctx.fillStyle = "rgb(156 163 175)";
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        return;
      }

      // Draw the full spectrogram image
      ctx.drawImage(image, 0, 0, ctx.canvas.width, ctx.canvas.height);
    },
    [image, withSpectrogram],
  );

  return {
    draw,
    image,
    isLoading,
    isError,
  };
}
