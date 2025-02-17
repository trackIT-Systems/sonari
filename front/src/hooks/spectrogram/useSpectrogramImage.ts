import { useEffect, useRef } from "react";
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
  preload = true,
  onAllSegmentsLoaded,
}: {
  recording: Recording;
  window: SpectrogramWindow;
  parameters: SpectrogramParameters;
  withSpectrogram: boolean;
  strict?: boolean;
  preload: boolean;
  onAllSegmentsLoaded?: () => void;
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

  // Keep track of which segments are currently loading
  const loadingSegments = useRef<Set<string>>(new Set());

  // Preload all segments
  useEffect(() => {
    if (!withSpectrogram || !preload) return;

    const loadSegment = async (segment: SpectrogramWindow) => {
      const segmentKey = spectrogramCache.generateKey(recording.uuid, segment, parameters);

      // Skip if already cached or already being loaded
      if (spectrogramCache.get(recording.uuid, segment, parameters) || loadingSegments.current.has(segmentKey)) {
        return;
      }

      loadingSegments.current.add(segmentKey);

      try {
        const url = api.spectrograms.getUrl({
          recording,
          segment: { min: segment.time.min, max: segment.time.max },
          parameters,
        });

        const response = await fetch(url);
        const size = parseInt(response.headers.get('content-length') || '0', 10);
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);

        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = async () => {
            try {
              await img.decode();
              await spectrogramCache.set(recording.uuid, segment, parameters, img, size);
              resolve(undefined);
            } catch (err) {
              reject(err);
            } finally {
              loadingSegments.current.delete(segmentKey);
              URL.revokeObjectURL(objectUrl);
            }
          };
          img.onerror = () => {
            loadingSegments.current.delete(segmentKey);
            URL.revokeObjectURL(objectUrl);
            reject();
          };
          img.src = objectUrl;
        });
      } catch (error) {
        loadingSegments.current.delete(segmentKey);
      }
    };

    Promise.all(allSegments.map(segment => loadSegment(segment)))
      .then(() => {
          onAllSegmentsLoaded?.();
      });
  }, [recording, parameters, allSegments, withSpectrogram, onAllSegmentsLoaded]);

  return image;
}