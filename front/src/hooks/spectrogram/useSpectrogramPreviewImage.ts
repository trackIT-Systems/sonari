import { useCallback, useEffect, useState } from "react";
import api from "@/app/api";
import type { LoadQueue } from "@/utils/loadQueue";
import { spectrogramCache } from "@/utils/spectrogram_cache";

import type { SpectrogramParameters, SpectrogramWindow } from "@/types";

function isCancel(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name;
  return name === "CanceledError" || name === "AbortError";
}

/** A failed load is retried this many times before the error is shown */
const MAX_AUTO_RETRIES = 2;
const RETRY_DELAY_MS = 1500;

/**
 * Loads the whole segment as one spectrogram image (no chunking).
 * Intended for small static previews of short segments. The request is cancelled
 * when the preview goes away or changes, so the server skips it if it has not
 * started rendering yet.
 */
export default function useSpectrogramPreviewImage({
  recording_id,
  segment,
  parameters,
  enabled,
  queue,
}: {
  recording_id: number;
  segment: SpectrogramWindow;
  parameters: SpectrogramParameters;
  enabled: boolean;
  /** Load through this queue, e.g. to load a gallery's tiles a few at a time */
  queue?: LoadQueue;
}) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [isError, setIsError] = useState(false);
  // Bumped to load again after a failure (automatic or via `retry`).
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let retryTimer: number | undefined;
    const controller = new AbortController();
    setImage(null);
    setIsError(false);

    const fetchBlob = () =>
      api.spectrograms.getBlob({
        recording_id,
        segment: { min: segment.time.min, max: segment.time.max },
        parameters,
        signal: controller.signal,
      });

    spectrogramCache
      .getOrLoad(recording_id, segment, parameters, async () => {
        const blob = await (queue ? queue.run(fetchBlob, controller.signal) : fetchBlob());

        const size = blob.size;
        const objectUrl = URL.createObjectURL(blob);
        try {
          const img = new Image();
          await new Promise<void>((resolve, reject) => {
            img.onload = () => img.decode().then(resolve, reject);
            img.onerror = reject;
            img.src = objectUrl;
          });
          return { image: img, size };
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
      }, controller.signal)
      .then((loaded) => {
        if (!cancelled) setImage(loaded);
      })
      .catch((error) => {
        if (cancelled) return;
        if (isCancel(error)) {
          // Joined a load that another preview of the same image cancelled
          setAttempt((n) => n + 1);
          return;
        }
        console.error("Failed to load spectrogram preview:", error);
        if (attempt < MAX_AUTO_RETRIES) {
          retryTimer = window.setTimeout(() => setAttempt((n) => n + 1), RETRY_DELAY_MS);
        } else {
          setIsError(true);
        }
      });

    return () => {
      cancelled = true;
      window.clearTimeout(retryTimer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `attempt` only re-triggers the load
  }, [recording_id, segment, parameters, enabled, attempt, queue]);

  return { image, isError, isLoading: enabled && image == null && !isError, retry };
}
