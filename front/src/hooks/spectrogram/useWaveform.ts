import { useCallback, useMemo } from "react";
import useWaveformImage from "@/hooks/spectrogram/useWaveformImage";
import type { Recording, SpectrogramParameters, SpectrogramWindow, WaveformWindow } from "@/types";

// Convert a 2D SpectrogramWindow to 1D WaveformWindow
export function toWaveformWindow(window: SpectrogramWindow): WaveformWindow {
  return {
    time: { ...window.time }, // New object to trigger updates
  };
}

export default function useWaveform({
  recording,
  parameters,
  window,
}: {
  recording: Recording;
  parameters: SpectrogramParameters;
  window: SpectrogramWindow;
}) {
  const waveformWindow = useMemo(
    () => toWaveformWindow(window),
    [window]
  );

  const { draw: drawImage, isLoading, isError } = useWaveformImage({
    recording,
    parameters,
    window: waveformWindow,
  });

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      drawImage(ctx);
    },
    [drawImage]
  );

  return {
    draw,
    isLoading,
    isError,
    window: waveformWindow,
  };
}
