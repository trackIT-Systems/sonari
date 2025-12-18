import { useState, useEffect, useMemo, useCallback } from "react";
import type { Recording, SpectrogramParameters, WaveformWindow } from "@/types";
import api from "@/app/api";
import { z } from "zod";
import { SPECTROGRAM_CANVAS_DIMENSIONS, WAVEFORM_CANVAS_DIMENSIONS } from "@/constants";

type UseWaveformImageParams = {
  recording: Recording;
  window: WaveformWindow;
  parameters: SpectrogramParameters
};

export default function useWaveformImage({ recording, window, parameters }: UseWaveformImageParams) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    const loadImage = async () => {
      setIsLoading(true);
      setIsError(false);
      
      try {
        // Use authenticated API method to get blob
        const blob = await api.waveforms.getBlob({
          recording,
          parameters,
        });
        const objectUrl = URL.createObjectURL(blob);
        
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => {
            setImage(img);
            setIsLoading(false);
            URL.revokeObjectURL(objectUrl);
            resolve();
          };
          img.onerror = () => {
            setIsError(true);
            setIsLoading(false);
            URL.revokeObjectURL(objectUrl);
            reject(new Error('Failed to load image'));
          };
          img.src = objectUrl;
        });
      } catch (error) {
        console.error('Failed to load waveform image:', error);
        setIsError(true);
        setIsLoading(false);
      }
    };
    
    loadImage();
  }, [recording, parameters]);

  const draw = useCallback((ctx: CanvasRenderingContext2D) => {
    if (!image) return;
    const { min, max } = window.time;
    const duration = recording.duration;
  
    const cropX = (min / duration) * image.width;
    const cropWidth = ((max - min) / duration) * image.width;
  
    ctx.clearRect(0, 0, WAVEFORM_CANVAS_DIMENSIONS.width, WAVEFORM_CANVAS_DIMENSIONS.height);
  
    ctx.drawImage(
      image,
      cropX, 0,
      cropWidth, image.height,
      0, 0,
      WAVEFORM_CANVAS_DIMENSIONS.width, WAVEFORM_CANVAS_DIMENSIONS.height
    );
  }, [image, window.time, recording.duration]);
  

  return { draw, isLoading, isError };
}