import { useEffect, useState } from "react";
import api from "@/app/api";
import { spectrogramCache } from "@/utils/spectrogram_cache";

import type { SpectrogramParameters, SpectrogramWindow } from "@/types";

/**
 * Loads the whole segment as one spectrogram image (no chunking).
 * Intended for small static previews of short segments.
 */
export default function useSpectrogramPreviewImage({
  recording_id,
  segment,
  parameters,
  enabled,
}: {
  recording_id: number;
  segment: SpectrogramWindow;
  parameters: SpectrogramParameters;
  enabled: boolean;
}) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    setImage(null);
    setIsError(false);

    spectrogramCache
      .getOrLoad(recording_id, segment, parameters, async () => {
        const blob = await api.spectrograms.getBlob({
          recording_id,
          segment: { min: segment.time.min, max: segment.time.max },
          parameters,
        });

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
      })
      .then((loaded) => {
        if (!cancelled) setImage(loaded);
      })
      .catch((error) => {
        console.error("Failed to load spectrogram preview:", error);
        if (!cancelled) setIsError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [recording_id, segment, parameters, enabled]);

  return { image, isError, isLoading: enabled && image == null && !isError };
}
