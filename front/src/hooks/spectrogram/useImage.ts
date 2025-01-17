/** Hook to load an image and get its status
 *
 * This hook uses the browser's Image API to load an image and get its status.
 * This enables the browser to cache the image and avoid reloading it when it
 * is used multiple times.
 *
 * The hook exposes the image element, its loading status, and any error that
 * occurred.
 *
 * A timeout can be provided to fail if the image takes too long to load.
 *
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useEvent, useTimeoutFn, useUnmount } from "react-use";

// Default timeout in milliseconds
const DEFAULT_TIMEOUT = 30_000;

export type ImageStatus = {
  image: HTMLImageElement;
  isLoading: boolean;
  isError: boolean;
  error: string | null;
  url: string;
};

export default function useImage({
  url,
  timeout = DEFAULT_TIMEOUT,
  onLoad,
  onError,
  onTimeout,
  withSpectrogram,
}: {
  url: string;
  timeout?: number;
  onLoad?: () => void;
  onError?: () => void;
  onTimeout?: () => void;
  withSpectrogram: boolean;
}): ImageStatus {
  const ref = useRef<HTMLImageElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  if (ref.current === null) {
    // @ts-ignore
    ref.current = new Image();
  }

  // Update the image when the url changes
  useEffect(() => {
    if (!ref.current) return;

    if (!withSpectrogram) {
      ref.current.src = "";
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    ref.current.src = url;
  }, [url, withSpectrogram]);

  // Timeout loading after a given time
  const handleOnTimeout = useCallback(() => {
    setError("Took too long to load");
    setLoading(false);
    onTimeout?.();
  }, [onTimeout]);

  const [_, cancel] = useTimeoutFn(handleOnTimeout, timeout);

  // Handle error events
  const handleOnError = useCallback(() => {
    setLoading(false);
    setError("Unknown error");
    cancel();
    onError?.();
  }, [cancel, onError]);
  useEvent("error", withSpectrogram ? handleOnError : () => { }, withSpectrogram ? ref.current : null);

  // Handle loading events
  const handleOnLoad = useCallback(async () => {
    try {
      if (ref.current) {
        await ref.current.decode(); // Wait for image to be fully decoded
      }
      setLoading(false);
      setError(null);
      cancel();
      onLoad?.();
    } catch (err) {
      handleOnError();
    }
  }, [cancel, onLoad, handleOnError]);
  useEvent("load", withSpectrogram ? handleOnLoad : () => { }, withSpectrogram ? ref.current : null);

  // Cancel loading on unmount
  useUnmount(() => {
    cancel();
    if (ref.current != null) {
      ref.current.src = "";
    }
  });

  return {
    url,
    image: withSpectrogram ? ref.current : new Image(),
    isLoading: withSpectrogram ? loading : false,
    isError: withSpectrogram ? false : error != null,
    error,
  };
}
