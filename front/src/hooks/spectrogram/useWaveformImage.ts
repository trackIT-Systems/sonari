import { useState, useEffect, useMemo, useCallback } from "react";
import type { Recording, SpectrogramParameters, WaveformWindow } from "@/types";
import api from "@/app/api";
import { z } from "zod";
import { CANVAS_DIMENSIONS } from "@/constants";

type UseWaveformImageParams = {
  recording: Recording;
  window: WaveformWindow;
  parameters: SpectrogramParameters
};

export default function useWaveformImage({ recording, window, parameters }: UseWaveformImageParams) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  const url = useMemo(() => {
    return api.waveforms.getUrl({
      recording,
      parameters
    });
  }, [recording, parameters]);

  useEffect(() => {
    const img = new Image();
    img.src = url;
    img.onload = () => {
      setImage(img);
      setIsLoading(false);
    };
    img.onerror = () => {
      setIsError(true);
      setIsLoading(false);
    };
  }, [recording.id, window.time.min, window.time.max, url]);

  const draw = useCallback((ctx: CanvasRenderingContext2D) => {
    if (!image) return;
    const { min, max } = window.time;
    const duration = recording.duration;
    const canvasWidth = CANVAS_DIMENSIONS.width;
    const canvasHeight = CANVAS_DIMENSIONS.height;
  
    const cropX = (min / duration) * image.width;
    const cropWidth = ((max - min) / duration) * image.width;
  
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  
    ctx.drawImage(
      image,
      cropX, 0,
      cropWidth, image.height,
      0, 0,
      canvasWidth, canvasHeight
    );
  }, [image, window.time, recording.duration]);
  

  return { draw, isLoading, isError };
}
