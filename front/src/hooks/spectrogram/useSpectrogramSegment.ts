import { useCallback, useMemo, useEffect, useState } from "react";
import { DEFAULT_SPECTROGRAM_PARAMETERS } from "@/api/spectrograms";
import api from "@/app/api";
import drawImage from "@/draw/image";
import { useSpectrogramCache } from "@/utils/spectrogram_cache";

import type {
  Interval,
  SpectrogramParameters,
  SpectrogramWindow,
} from "@/types";
import { CANVAS_DIMENSIONS } from "@/constants";

type GetUrlFn = ({
  recording_id,
  segment,
  parameters,
  lowRes,
}: {
  recording_id: number;
  segment: Interval;
  parameters: SpectrogramParameters;
  lowRes?: boolean;
}) => string;

export default function useSpectrogramSegment({
  recording_id,
  samplerate,
  segment,
  parameters = DEFAULT_SPECTROGRAM_PARAMETERS,
  getSpectrogramImageUrl = api.spectrograms.getUrl,
  withSpectrogram,
  lowRes = false,
}: {
  recording_id: number;
  samplerate: number;
  segment: SpectrogramWindow;
  parameters?: SpectrogramParameters;
  getSpectrogramImageUrl?: GetUrlFn;
  withSpectrogram: boolean;
  lowRes?: boolean;
}) {
  const url = useMemo(() => {
    return getSpectrogramImageUrl({
      recording_id,
      segment: segment.time,
      parameters,
      lowRes,
    });
  }, [recording_id, segment, parameters, lowRes, getSpectrogramImageUrl]);

  const imageStatus = useSpectrogramCache({
    recording_id,
    segment,
    parameters,
    withSpectrogram,
    lowRes,
    url
  });

  const [isImageReady, setIsImageReady] = useState(false);

  useEffect(() => {
    if (!imageStatus.image || imageStatus.isError) {
      setIsImageReady(false);
      return;
    }

    // For cached images that are already loaded
    if (imageStatus.image.complete && imageStatus.image.naturalWidth !== 0) {
      setIsImageReady(true);
      return;
    }

    const handleLoad = () => setIsImageReady(true);
    imageStatus.image.addEventListener('load', handleLoad);
    
    return () => {
      if (imageStatus.image) {
        imageStatus.image.removeEventListener('load', handleLoad);
      }
    };
  }, [imageStatus.image, imageStatus.isError]);

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, window: SpectrogramWindow) => {
      if (!withSpectrogram) {
        ctx.fillStyle = "rgb(156 163 175)";
        ctx.roundRect(0, 0, CANVAS_DIMENSIONS.width, CANVAS_DIMENSIONS.height, 10);
        ctx.fill();
        return;
      }

      if (imageStatus.image && segment) {
        drawImage({
          ctx,
          image: imageStatus.image,
          window,
          segment,
        });
      } else {
        // Loading indicator
        ctx.fillStyle = "rgb(200 200 200)";
        ctx.fillRect(0, 0, CANVAS_DIMENSIONS.width, CANVAS_DIMENSIONS.height);
      }
    },
    [imageStatus.image, segment, withSpectrogram],
  );


  return {
    image: imageStatus.image,
    segment,
    isLoading: imageStatus.isLoading || !isImageReady,
    isError: imageStatus.isError,
    draw,
  } as const;
}