import { useCallback, useMemo } from "react";

import { DEFAULT_SPECTROGRAM_PARAMETERS } from "@/api/spectrograms";
import api from "@/app/api";
import drawImage from "@/draw/image";
import useImage from "@/hooks/spectrogram/useImage";

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

/** Use the image of a spectrogram window.
 * This hook will load the image of a spectrogram corresponding to
 * the given window (time and freq bounds) and parameters.
 */
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

  // Start loading the image
  const { isLoading, isError, image } = useImage({ url, withSpectrogram: withSpectrogram });

  // Create a callback to draw the image on a canvas. The callback takes in a
  // canvas context and the current viewport (window). It will draw the image
  // on the canvas, adjusting the position and size relative to the viewport.
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, view: SpectrogramWindow) => {
      if (isLoading || isError) return;
      if (withSpectrogram) {
       drawImage({
          ctx,
          image,
          window: view,
          bounds: spectrogramWindow,
        });
      } else {
        {
          ctx.fillStyle = "rgb(156 163 175)";
          ctx.roundRect(0, 0, ctx.canvas.width, ctx.canvas.height, 10);
          ctx.fill();
        }
      }
    },
    [image, spectrogramWindow, isLoading, isError, withSpectrogram],
  );

  return {
    image,
    viewport: spectrogramWindow,
    isLoading,
    isError,
    draw,
  } as const;
}
