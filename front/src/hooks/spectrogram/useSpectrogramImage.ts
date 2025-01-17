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
    if (!withSpectrogram) return;

    // Load segments sequentially to avoid overwhelming the browser
    const loadSegments = async () => {
      for (const segment of allSegments) {

        const segmentKey = spectrogramCache.generateKey(recording.uuid, segment, parameters);

        // Skip if already cached or already being loaded
        if (
          spectrogramCache.get(recording.uuid, segment, parameters) ||
          loadingSegments.current.has(segmentKey)
        ) {
          continue;
        }

        loadingSegments.current.add(segmentKey);

        try {
          // Create and load image
          const img = new Image();
          await new Promise((resolve, reject) => {
            img.onload = async () => {
              try {
                await img.decode();
                spectrogramCache.set(recording.uuid, segment, parameters, img);
                resolve(undefined);
              } catch (err) {
                reject(err);
              } finally {
                // Always remove from loading set, whether successful or not
                loadingSegments.current.delete(segmentKey);
              }
            };
            img.onerror = () => {
              loadingSegments.current.delete(segmentKey);
              reject();
            };
            img.src = api.spectrograms.getUrl({
              recording,
              segment: { min: segment.time.min, max: segment.time.max },
              parameters,
            });
          });
        } catch (error) {
          console.error('Failed to load segment:', error);
        }
      }
    };

    loadSegments();

    return () => {
      loadingSegments.current.clear();
    };
  }, [recording.uuid, parameters, allSegments, withSpectrogram]);

  return image;
}