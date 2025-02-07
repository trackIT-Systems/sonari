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
  preload = false,
}: {
  recording: Recording;
  window: SpectrogramWindow;
  parameters: SpectrogramParameters;
  withSpectrogram: boolean;
  strict?: boolean;
  preload?: boolean;
}) {
  const { selected, allSegments } = useRecordingSegments({
    recording,
    window,
    strict,
  });

  // Keep track of which segments are currently loading
  const loadingSegments = useRef<Set<string>>(new Set());

  // Load the current segment
  const image = useSpectrogramWindow({
    recording,
    window: selected,
    parameters,
    withSpectrogram,
  });

  // Preload all segments
  useEffect(() => {
    if (!withSpectrogram || !preload) return;

    const currentLoadingSegments = new Set<string>();
    const currentRef = loadingSegments.current; // Store ref value locally

    // Load segments sequentially to avoid overwhelming the browser
    const loadSegments = async () => {
      for (const segment of allSegments) {
        const segmentKey = spectrogramCache.generateKey(recording.uuid, segment, parameters);

        // Skip if already cached or already being loaded
        if (
          spectrogramCache.get(recording.uuid, segment, parameters) ||
          currentLoadingSegments.has(segmentKey)
        ) {
          continue;
        }

        currentRef.add(segmentKey);
        currentLoadingSegments.add(segmentKey);

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
                currentRef.delete(segmentKey);
                currentLoadingSegments.delete(segmentKey);
                URL.revokeObjectURL(objectUrl);
              }
            };
            img.onerror = () => {
              currentRef.delete(segmentKey);
              currentLoadingSegments.delete(segmentKey);
              URL.revokeObjectURL(objectUrl);
              reject();
            };
            img.src = objectUrl;
          });
        } catch (error) {
          console.error('Failed to load segment:', error);
          currentRef.delete(segmentKey);
          currentLoadingSegments.delete(segmentKey);
        }
      }
    };

    loadSegments();

    return () => {
      currentLoadingSegments.forEach(segmentKey => {
        currentRef.delete(segmentKey);
      });
      currentLoadingSegments.clear();
    };
  }, [recording, parameters, allSegments, selected, withSpectrogram]);

  return image;
}