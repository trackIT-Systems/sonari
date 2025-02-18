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

  const image = useSpectrogramWindow({
    recording,
    window: selected,
    parameters,
    withSpectrogram,
  });

  // Only track loading segments to prevent duplicate loads
  const loadingSegments = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!withSpectrogram || !preload) return;

    async function loadSegment(segment: SpectrogramWindow) {
      const segmentKey = spectrogramCache.generateKey(recording.uuid, segment, parameters);

      // Skip if already cached or loading
      if (spectrogramCache.get(recording.uuid, segment, parameters) ||
        loadingSegments.current.has(segmentKey)) {
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

        try {
          await new Promise<void>((resolve, reject) => {
            img.onload = async () => {
              try {
                await img.decode();
                await spectrogramCache.set(recording.uuid, segment, parameters, img, size);
                resolve();
              } catch (err) {
                reject(err);
              }
            };
            img.onerror = reject;
            img.src = objectUrl;
          });
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
      } finally {
        loadingSegments.current.delete(segmentKey);
      }
    }

    async function loadAllSegments() {
      try {
        await Promise.all(allSegments
          .filter((s) => selected.time.min != s.time.min && selected.time.max != s.time.max)
          .map(loadSegment)
        );
        onAllSegmentsLoaded?.();
      } catch (error) {
        console.error('Failed to load segments:', error);
      }
    }

    loadAllSegments();
  }, [recording, parameters, allSegments, selected, withSpectrogram, onAllSegmentsLoaded]);

  return image;
}