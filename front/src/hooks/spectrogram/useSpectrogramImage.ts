import { useEffect } from "react";
import useRecordingSegments from "@/hooks/spectrogram/useRecordingSegments";
import useSpectrogramWindow from "./useSpectrogramWindow";
import { spectrogramCache } from "@/utils/spectrogram_cache";

import type {
  Recording,
  SpectrogramParameters,
  SpectrogramWindow,
} from "@/types";

import api from "@/app/api";

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
  // Get the current segments we're interested in
  const { selected, prev, next, allSegments } = useRecordingSegments({
    recording,
    window,
    strict,
  });

  // Load the current segment
  const image = useSpectrogramWindow({
    recording,
    window: selected,
    parameters,
    withSpectrogram,
  });

  // Preload all segments
  useEffect(() => {
    if (!withSpectrogram) return;


    const effectKey = JSON.stringify({
      recordingId: recording.uuid,
      parameters,
      selectedTime: selected.time,
    });


    // Filter out segments that are currently visible
    const segmentsToLoad = allSegments.filter(
      (segment) => segment.time.min !== selected.time.min
    );

    let isMounted = true;
    let currentIndex = 0;

    const loadNextSegment = () => {
      if (!isMounted || currentIndex >= segmentsToLoad.length) {
        return;
      }

      const segment = segmentsToLoad[currentIndex];

      // Check if already cached
      if (spectrogramCache.get(recording.uuid, segment, parameters)) {
        currentIndex++;
        loadNextSegment();
        return;
      }

      // Load new image
      const img = new Image();
      
      img.onload = () => {
        if (!isMounted) return;
        
        spectrogramCache.set(recording.uuid, segment, parameters, img);
        currentIndex++;
        loadNextSegment();
      };

      img.onerror = () => {
        if (!isMounted) return;
        
        currentIndex++;
        loadNextSegment();
      };

      img.src = api.spectrograms.getUrl({
        recording,
        segment: {min: segment.time.min, max: segment.time.max},
        parameters
      });
    };

    loadNextSegment();

    return () => {
      isMounted = false;
    };
  }, [recording, parameters]);

  return image;
}
