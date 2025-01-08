import useRecordingSegments from "@/hooks/spectrogram/useRecordingSegments";
import useSpectrogramWindow from "./useSpectrogramWindow";

import type {
  Recording,
  SpectrogramParameters,
  SpectrogramWindow,
} from "@/types";

export default function useSpectrogramImage({
  recording,
  window,
  parameters,
  withSpectrogram,
  strict,
}: {
  recording: Recording;
  window: SpectrogramWindow;
  parameters: SpectrogramParameters;
  withSpectrogram: boolean;
  strict?: boolean;
}) {
  // Get a spectrogram segment that covers the window
  const { selected, prev, next } = useRecordingSegments({
    recording: recording,
    window: window,
    strict: strict,
  });

  // Load the spectrogram segment
  const image = useSpectrogramWindow({
    recording,
    window: selected,
    parameters: parameters,
    withSpectrogram,
  });

  // Load the previous and next spectrogram segments in the background
  useSpectrogramWindow({
    recording,
    window: prev,
    parameters: parameters,
    withSpectrogram,
  });
  useSpectrogramWindow({
    recording,
    window: next,
    parameters: parameters,
    withSpectrogram,
  });

  return image;
}
