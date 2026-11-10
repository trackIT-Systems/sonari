import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { LoadQueue } from "@/utils/loadQueue";
import {
  MAX_IMAGE_RETRIES,
  getCachedImage,
  imageRetryDelay,
  isAbortError,
  loadImage,
  type ImageRequest,
} from "@/utils/spectrogram_images";

import type { SpectrogramParameters, SpectrogramWindow } from "@/types";

/**
 * Loads the whole segment as one spectrogram image (no chunking).
 * Intended for small static previews of short segments. Loading, caching and
 * retries work as for the chunks of the annotate view (see `spectrogram_images`).
 * The request is cancelled when the preview goes away or changes, so the server
 * skips it if it has not started rendering yet.
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
  const failuresRef = useRef(0);
  const retry = useCallback(() => {
    failuresRef.current = 0;
    setAttempt((n) => n + 1);
  }, []);

  const request = useMemo<ImageRequest>(
    () => ({ kind: "spectrogram", recording_id, segment, parameters }),
    [recording_id, segment, parameters],
  );

  // A new image starts with a fresh set of retries
  const requestRef = useRef(request);
  if (requestRef.current !== request) {
    requestRef.current = request;
    failuresRef.current = 0;
  }

  // An image already in the cache (e.g. prefetched) shows at once, even before
  // the preview is enabled
  const cached = useMemo(
    () => getCachedImage(request),
    // `image` changes when a load finished, which may have filled the cache
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [request, image],
  );

  useEffect(() => {
    if (!enabled) return;
    if (cached) {
      setImage(cached);
      setIsError(false);
      return;
    }

    let cancelled = false;
    let retryTimer: number | undefined;
    const controller = new AbortController();
    setImage(null);
    setIsError(false);

    loadImage(request, { signal: controller.signal, queue })
      .then((loaded) => {
        if (!cancelled) setImage(loaded);
      })
      .catch((error) => {
        if (cancelled) return;
        if (isAbortError(error)) {
          // Joined a load that someone else cancelled: load it ourselves
          setAttempt((n) => n + 1);
          return;
        }
        failuresRef.current += 1;
        if (failuresRef.current > MAX_IMAGE_RETRIES) {
          console.error("Failed to load spectrogram preview:", error);
          setIsError(true);
        } else {
          retryTimer = window.setTimeout(
            () => setAttempt((n) => n + 1),
            imageRetryDelay(failuresRef.current),
          );
        }
      });

    return () => {
      cancelled = true;
      window.clearTimeout(retryTimer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `attempt` only re-triggers the load
  }, [request, enabled, attempt, queue, cached]);

  const shown = cached ?? image;
  return { image: shown, isError, isLoading: enabled && shown == null && !isError, retry };
}
