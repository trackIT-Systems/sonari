import { useCallback, useMemo, useEffect, useState } from "react";
import { DEFAULT_SPECTROGRAM_PARAMETERS } from "@/api/spectrograms";
import api from "@/app/api";
import drawImage from "@/draw/image";
import { useSpectrogramCache, spectrogramCache } from "@/utils/spectrogram_cache";

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
  const url = useMemo(() => {
    return getSpectrogramImageUrl({
      recording,
      segment: spectrogramWindow.time,
      parameters,
      lowRes,
    });
  }, [recording, spectrogramWindow.time, parameters, lowRes, getSpectrogramImageUrl]);

  const imageStatus = useSpectrogramCache({
    recording,
    window: spectrogramWindow,
    parameters,
    withSpectrogram,
    url
  });

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, view: SpectrogramWindow) => {
      if (!withSpectrogram) {
        ctx.fillStyle = "rgb(156 163 175)";
        ctx.roundRect(0, 0, ctx.canvas.width, ctx.canvas.height, 10);
        ctx.fill();
        return;
      }

      if (imageStatus.image) {
        drawImage({
          ctx,
          image: imageStatus.image,
          window: view,
          bounds: spectrogramWindow,
        });
      } else {
        // Loading indicator
        ctx.fillStyle = "rgb(200 200 200)";
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      }
    },
    [imageStatus.image, spectrogramWindow, withSpectrogram]
  );

  return {
    image: imageStatus.image,
    viewport: spectrogramWindow,
    isLoading: imageStatus.isLoading || !imageStatus.image?.complete,
    isError: imageStatus.isError,
    draw,
  } as const;
}