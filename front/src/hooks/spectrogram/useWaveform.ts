import { useCallback } from "react";
import useWaveformImages from "@/hooks/spectrogram/useWaveformImages";
import { drawStitchedWaveform } from "@/draw/image";
import type { Recording, SpectrogramParameters, SpectrogramWindow } from "@/types";

export default function useWaveform({
  recording,
  parameters,
  window,
  onSegmentsLoaded,
}: {
  recording: Recording;
  parameters: SpectrogramParameters;
  window: SpectrogramWindow;
  onSegmentsLoaded?: () => void;
}) {
  const { chunks, isLoading, isError } = useWaveformImages({
    recording,
    window: { time: window.time },
    parameters,
    onAllSegmentsLoaded: onSegmentsLoaded,
  });

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      drawStitchedWaveform({
        ctx,
        viewport: { time: window.time },
        chunks,
      });
    },
    [chunks, window.time]
  );

  return {
    draw,
    isLoading,
    isError,
  };
}
