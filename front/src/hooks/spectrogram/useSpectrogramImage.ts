import { useEffect } from "react";
import useSpectrogramSegmentation from "@/hooks/spectrogram/useSpectrogramSegmentation";
import useSpectrogramSegment from "./useSpectrogramSegment";
import { spectrogramCache } from "@/utils/spectrogram_cache";

import type {
  AnnotationTask,
  SpectrogramParameters,
  SpectrogramWindow,
} from "@/types";

import api from "@/app/api";

export default function useSpectrogramImage({
  task,
  samplerate,
  window,
  parameters,
  withSpectrogram,
  preload = true,
  onAllSegmentsLoaded,
}: {
  task: AnnotationTask,
  samplerate: number,
  window: SpectrogramWindow;
  parameters: SpectrogramParameters;
  withSpectrogram: boolean;
  preload: boolean;
  onAllSegmentsLoaded?: () => void;
}) {
  const { selected, allSegments } = useSpectrogramSegmentation({
    startTime: task.start_time,
    endTime: task.end_time,
    samplerate,
    window,
  });

  console.log('Segment selection window:', window);

  const image = useSpectrogramSegment({
    recording_id: task.recording_id,
    samplerate,
    segment: selected,
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
            task.recording_id,
            segment,
            parameters,
            false,
            async () => {
              const url = api.spectrograms.getUrl({
                recording_id: task.recording_id,
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
  }, [task.recording_id, parameters, allSegments, selected, withSpectrogram, onAllSegmentsLoaded, preload]);

  return image;
}