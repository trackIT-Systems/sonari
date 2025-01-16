import { useCallback, useMemo, useEffect } from "react";
import { DEFAULT_SPECTROGRAM_PARAMETERS } from "@/api/spectrograms";
import api from "@/app/api";
import drawImage from "@/draw/image";
import useImage from "@/hooks/spectrogram/useImage";
import { spectrogramCache } from "@/utils/spectrogram_cache";

import type {
  Interval,
  Recording,
  SpectrogramParameters,
  SpectrogramWindow,
} from "@/types";

type GetUrlFn = ({
  recording,
  segment,
  parameters,
  lowRes,
}: {
  recording: Recording;
  segment: Interval;
  parameters: SpectrogramParameters;
  lowRes?: boolean;
}) => string;

export default function useSpectrogramWindow({
  recording,
  window: spectrogramWindow,
  parameters = DEFAULT_SPECTROGRAM_PARAMETERS,
  getSpectrogramImageUrl = api.spectrograms.getUrl,
  withSpectrogram,
  lowRes = false,
}: {
  recording: Recording;
  window: SpectrogramWindow;
  parameters?: SpectrogramParameters;
  getSpectrogramImageUrl?: GetUrlFn;
  withSpectrogram: boolean;
  lowRes?: boolean;
}) {
  // Get the url of the image to load
  const url = useMemo(() => {
    return getSpectrogramImageUrl({
      recording,
      segment: spectrogramWindow.time,
      parameters,
      lowRes,
    });
  }, [recording, spectrogramWindow.time, parameters, lowRes, getSpectrogramImageUrl]);

  // Check cache first
  const cachedImage = useMemo(() => 
    withSpectrogram ? spectrogramCache.get(recording.uuid, spectrogramWindow, parameters) : null
  , [withSpectrogram, recording.uuid, spectrogramWindow, parameters]);

  // Load image if not in cache
  const { isLoading, isError, image } = useImage({ 
    url, 
    withSpectrogram: withSpectrogram,
    cachedImage,
  });

  // Cache the image once it's loaded successfully
  useEffect(() => {
    if (
      withSpectrogram && 
      !isLoading && 
      !isError && 
      image instanceof HTMLImageElement &&
      image.complete &&
      image.src === url
    ) {
      spectrogramCache.set(recording.uuid, spectrogramWindow, parameters, image);
    }
  }, [
    withSpectrogram,
    isLoading,
    isError,
    image,
    url,
    recording.uuid,
    spectrogramWindow,
    parameters
  ]);

  // Create a callback to draw the image
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, view: SpectrogramWindow) => {
      if (!withSpectrogram) {
        ctx.fillStyle = "rgb(156 163 175)";
        ctx.roundRect(0, 0, ctx.canvas.width, ctx.canvas.height, 10);
        ctx.fill();
        return;
      }

      // Use cached image or loaded image
      const imageToUse = cachedImage || image;

      // Only draw if we have a valid image
      if (imageToUse && imageToUse.complete && !isError) {
        drawImage({
          ctx,
          image: imageToUse,
          window: view,
          bounds: spectrogramWindow,
        });
      }
    },
    [image, cachedImage, spectrogramWindow, isError, withSpectrogram],
  );

  const effectiveImage = cachedImage || image;
  const effectiveIsLoading = !cachedImage && isLoading;
  const effectiveIsError = !cachedImage && isError;

  return {
    image: effectiveImage,
    viewport: spectrogramWindow,
    isLoading: effectiveIsLoading,
    isError: effectiveIsError,
    draw,
  } as const;
}