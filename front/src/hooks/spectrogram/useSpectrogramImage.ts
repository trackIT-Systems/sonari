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

  // Keep track of which segments are currently loading
  const loadingSegments = useRef<Set<string>>(new Set());

  // Load the current segment
  const image = useSpectrogramWindow({
    recording,
    window: selected,
    parameters,
    withSpectrogram,
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  const effectInstanceCounter = useRef(0);

  // Preload all segments
  useEffect(() => {
    if (!withSpectrogram || !preload) return;

    const effectInstance = ++effectInstanceCounter.current;
    console.log(`[Effect ${effectInstance}] Starting new effect instance`);

    // Abort previous controller if it exists
    if (abortControllerRef.current) {
      console.log(`[Effect ${effectInstance}] Aborting previous controller`);
      abortControllerRef.current.abort();
    }

    // Create new AbortController for this effect instance
    abortControllerRef.current = new AbortController();
    const { signal } = abortControllerRef.current;

    const currentLoadingSegments = new Set<string>();
    const currentRef = loadingSegments.current;

    const loadSegment = async (segment: SpectrogramWindow) => {
      const segmentKey = spectrogramCache.generateKey(recording.uuid, segment, parameters);

      // Skip if already cached or already being loaded
      if (spectrogramCache.get(recording.uuid, segment, parameters) || currentLoadingSegments.has(segmentKey)) {
        console.log(`[Effect ${effectInstance}] Segment ${segmentKey} already cached or loading, skipping`);
        return;
      }

      console.log(`[Effect ${effectInstance}] Starting to load segment ${segmentKey}`);
      currentRef.add(segmentKey);
      currentLoadingSegments.add(segmentKey);

      try {
        if (signal.aborted) {
          console.log(`[Effect ${effectInstance}] Aborted before fetch for ${segmentKey}`);
          throw new Error('Aborted');
        }

        const url = api.spectrograms.getUrl({
          recording,
          segment: { min: segment.time.min, max: segment.time.max },
          parameters,
        });

        console.log(`[Effect ${effectInstance}] Fetching ${segmentKey}`);
        const response = await fetch(url, { signal });
        
        if (signal.aborted) {
          console.log(`[Effect ${effectInstance}] Aborted after fetch for ${segmentKey}`);
          throw new Error('Aborted');
        }

        const size = parseInt(response.headers.get('content-length') || '0', 10);
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);

        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = async () => {
            try {
              if (signal.aborted) {
                console.log(`[Effect ${effectInstance}] Aborted before decode for ${segmentKey}`);
                throw new Error('Aborted');
              }

              console.log(`[Effect ${effectInstance}] Decoding ${segmentKey}`);
              await img.decode();
              
              if (signal.aborted) {
                console.log(`[Effect ${effectInstance}] Aborted before cache for ${segmentKey}`);
                throw new Error('Aborted');
              }

              await spectrogramCache.set(recording.uuid, segment, parameters, img, size);
              console.log(`[Effect ${effectInstance}] Successfully cached ${segmentKey}`);
              resolve(undefined);
            } catch (err) {
              reject(err);
            } finally {
              console.log(`[Effect ${effectInstance}] Cleanup for ${segmentKey}`);
              currentRef.delete(segmentKey);
              currentLoadingSegments.delete(segmentKey);
              URL.revokeObjectURL(objectUrl);
            }
          };
          img.onerror = () => {
            console.log(`[Effect ${effectInstance}] Image error for ${segmentKey}`);
            currentRef.delete(segmentKey);
            currentLoadingSegments.delete(segmentKey);
            URL.revokeObjectURL(objectUrl);
            reject();
          };
          img.src = objectUrl;
        });
      } catch (error) {
        if (signal.aborted) {
          console.log(`[Effect ${effectInstance}] Request aborted for ${segmentKey}`);
        } else {
          console.error(`[Effect ${effectInstance}] Failed to load segment ${segmentKey}:`, error);
        }
        currentRef.delete(segmentKey);
        currentLoadingSegments.delete(segmentKey);
      }
    };

    // Launch all segment loads in parallel
    console.log(`[Effect ${effectInstance}] Starting to load ${allSegments.length} segments`);
    Promise.all(allSegments.map(segment => loadSegment(segment)))
      .then(() => {
        if (!signal.aborted) {
          console.log(`[Effect ${effectInstance}] All segments loaded successfully`);
          onAllSegmentsLoaded?.();
        }
      });

    return () => {
      console.log(`[Effect ${effectInstance}] Cleanup - aborting controller`);
      abortControllerRef.current?.abort();
      currentLoadingSegments.forEach(segmentKey => {
        console.log(`[Effect ${effectInstance}] Cleanup - removing ${segmentKey} from loading segments`);
        currentRef.delete(segmentKey);
      });
      currentLoadingSegments.clear();
    };
  }, [recording, parameters, allSegments, selected, withSpectrogram, onAllSegmentsLoaded]);

  return image;
}