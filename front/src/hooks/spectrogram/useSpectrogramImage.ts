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
  preload = true,
  onAllSegmentsLoaded,
}: {
  recording: Recording;
  window?: SpectrogramWindow;
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

  useEffect(() => {
    if (!withSpectrogram || !preload) return;

    async function loadSegments() {
      try {
        const segmentsToLoad = allSegments
          .filter((s) => selected.time.min !== s.time.min && selected.time.max !== s.time.max);

        await Promise.all(segmentsToLoad.map(segment =>
          spectrogramCache.getOrLoad(
            recording.id,
            segment,
            parameters,
            false,
            async () => {
              const url = api.spectrograms.getUrl({
                recording,
                segment: { min: segment.time.min, max: segment.time.max },
                parameters,
              });

              const response = await fetch(url);
              const size = parseInt(response.headers.get('content-length') || '0', 10);
              const blob = await response.blob();
              const objectUrl = URL.createObjectURL(blob);

              try {
                const img = new Image();
                await new Promise<void>((resolve, reject) => {
                  img.onload = async () => {
                    try {
                      await img.decode();
                      resolve();
                    } catch (err) {
                      reject(err);
                    }
                  };
                  img.onerror = reject;
                  img.src = objectUrl;
                });
                return { image: img, size };
              } finally {
                URL.revokeObjectURL(objectUrl);
              }
            }
          )
        ));

        onAllSegmentsLoaded?.();
      } catch (error) {
        console.error('Failed to load segments:', error);
      }
    }

    loadSegments();
  }, [recording, parameters, allSegments, selected, withSpectrogram, onAllSegmentsLoaded, preload]);

  return image;
}