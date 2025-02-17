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

type LoadingPromise = {
  segmentKey: string;
  promise: Promise<void>;
};

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

  const image = useSpectrogramWindow({
    recording,
    window: selected,
    parameters,
    withSpectrogram,
  });

  // Track both loading state and promises
  const loadingSegments = useRef<Set<string>>(new Set());
  const loadingPromises = useRef<LoadingPromise[]>([]);

  useEffect(() => {
    if (!withSpectrogram || !preload) return;

    const loadSegment = async (segment: SpectrogramWindow) => {
      const segmentKey = spectrogramCache.generateKey(recording.uuid, segment, parameters);

      // Skip if already cached
      if (spectrogramCache.get(recording.uuid, segment, parameters)) {
        return null;
      }

      // Skip if already loading, but return the existing promise
      if (loadingSegments.current.has(segmentKey)) {
        const existingPromise = loadingPromises.current.find(p => p.segmentKey === segmentKey);
        return existingPromise?.promise;
      }

      loadingSegments.current.add(segmentKey);

      const promise = (async () => {
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
                URL.revokeObjectURL(objectUrl);
              }
            };
            img.onerror = () => {
              URL.revokeObjectURL(objectUrl);
              reject();
            };
            img.src = objectUrl;
          });
        } finally {
          // Clean up tracking state when done
          loadingSegments.current.delete(segmentKey);
          loadingPromises.current = loadingPromises.current.filter(p => p.segmentKey !== segmentKey);
        }
      })();

      // Track the new promise
      loadingPromises.current.push({ segmentKey, promise });

      return promise;
    };

    // Collect all actual loading promises (filtering out nulls from already cached segments)
    const activePromises = allSegments
      .map(segment => loadSegment(segment))
      .filter((p): p is Promise<void> => p !== null);

    if (activePromises.length > 0) {
      Promise.all(activePromises)
        .then(() => {
          // Only call onAllSegmentsLoaded if there are no remaining loading promises
          if (loadingPromises.current.length === 0) {
            onAllSegmentsLoaded?.();
          }
        })
        .catch(console.error); // Consider better error handling
    } else if (loadingPromises.current.length === 0) {
      // If no new promises and no existing ones, everything is loaded
      onAllSegmentsLoaded?.();
    }

  }, [recording, parameters, allSegments, withSpectrogram, onAllSegmentsLoaded]);

  return image;
}