import { useEffect, useRef } from "react";
import useRecordingSegments from "@/hooks/spectrogram/useRecordingSegments";
import useSpectrogramWindow from "./useSpectrogramWindow";
import { spectrogramCache, useSpectrogramCache } from "@/utils/spectrogram_cache";

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
  const { selected, allSegments } = useRecordingSegments({
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

  useEffect(() => {
    if (!withSpectrogram) return;

    let isMounted = true;  // For cleanup

    const loadSegments = async () => {
      // Filter out segments that are already cached
      const segmentsToLoad = allSegments.filter(
        segment => !spectrogramCache.get(recording.uuid, segment, parameters) &&
                  !spectrogramCache.isLoading(recording.uuid, segment, parameters)
      );

      if (segmentsToLoad.length === 0) return;

      // Prepare segments for loading with priorities
      const segmentsWithPriority = segmentsToLoad.map(segment => {
        return {
          recordingId: recording.uuid,
          window: segment,
          parameters,
          url: api.spectrograms.getUrl({
            recording,
            segment: { min: segment.time.min, max: segment.time.max },
            parameters,
          }),
        };
      });

      try {
        // Only proceed if component is still mounted
        if (isMounted) {
          await spectrogramCache.loadSegmentsSequentially(segmentsWithPriority);
        }
      } catch (error) {
        console.error('Failed to load segments:', error);
      }
    };

    loadSegments();

    // Cleanup function
    return () => {
      isMounted = false;
    };

}, [recording, parameters, allSegments, selected, withSpectrogram]);

  return image;
}