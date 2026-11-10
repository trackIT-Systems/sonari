/**
 * The one way spectrogram and waveform images are loaded: previews, the chunks
 * of the annotate view, its waveform and its overview bar all go through here.
 * So they share
 *
 * - the in-memory cache (`spectrogramCache`), keyed by recording, segment and
 *   parameters: a request made twice, by whoever, is answered from memory, and
 *   one made while the same image is still loading joins that load;
 * - the HTTP cache and the server's disk cache (same URLs for the same image);
 * - the retry policy (`MAX_IMAGE_RETRIES`, `imageRetryDelay`);
 * - one background queue for prefetching (`prefetchImages`), which loads images
 *   ahead of time, a few at a time, behind what is on screen.
 */
import api from "@/app/api";
import { createLoadQueue, type LoadQueue } from "@/utils/loadQueue";
import { spectrogramCache } from "@/utils/spectrogram_cache";

import type { Recording, SpectrogramParameters, SpectrogramWindow } from "@/types";

/** A spectrogram or waveform image of a recording segment */
export type ImageRequest =
  | {
      kind: "spectrogram";
      recording_id: number;
      /** Time range requested; the frequency range is that of the image (cache key only) */
      segment: SpectrogramWindow;
      parameters: SpectrogramParameters;
    }
  | {
      kind: "waveform";
      recording: Recording;
      /** Time range requested; the frequency range is a dummy (cache key only) */
      segment: SpectrogramWindow;
      parameters: SpectrogramParameters;
    };

/** A failed load is retried this many times before it counts as an error */
export const MAX_IMAGE_RETRIES = 3;

/** Wait before retry number `failures` (1, 2, ...): 0.5 s, 1 s, 2 s */
export function imageRetryDelay(failures: number): number {
  return 500 * 2 ** (failures - 1);
}

/** Whether `error` comes from an aborted request (ours or one we joined) */
export function isAbortError(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name;
  return name === "CanceledError" || name === "AbortError";
}

function recordingIdOf(request: ImageRequest): number {
  return request.kind === "spectrogram" ? request.recording_id : request.recording.id;
}

/** The image, if it is in the in-memory cache */
export function getCachedImage(request: ImageRequest): HTMLImageElement | null {
  return spectrogramCache.get(recordingIdOf(request), request.segment, request.parameters);
}

/** Decode an image blob into a ready-to-draw `HTMLImageElement`. */
export async function blobToImage(
  blob: Blob,
): Promise<{ image: HTMLImageElement; size: number }> {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => img.decode().then(resolve, reject);
      img.onerror = reject;
      img.src = objectUrl;
    });
    return { image: img, size: blob.size };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function fetchBlob(request: ImageRequest, signal?: AbortSignal): Promise<Blob> {
  const segment = { min: request.segment.time.min, max: request.segment.time.max };
  if (request.kind === "waveform") {
    return api.waveforms.getBlob({
      recording: request.recording,
      segment,
      parameters: request.parameters,
      signal,
    });
  }
  return api.spectrograms.getBlob({
    recording_id: request.recording_id,
    segment,
    parameters: request.parameters,
    signal,
  });
}

/**
 * Loads an image into the cache, or returns the cached one.
 *
 * `signal` cancels the request (the server then skips it if it has not started
 * rendering). With a `queue`, the request waits for a slot there; `queueSignal`
 * (default: `signal`) drops it while it still waits.
 */
export function loadImage(
  request: ImageRequest,
  {
    signal,
    queue,
    queueSignal = signal,
  }: { signal?: AbortSignal; queue?: LoadQueue; queueSignal?: AbortSignal } = {},
): Promise<HTMLImageElement> {
  return spectrogramCache.getOrLoad(
    recordingIdOf(request),
    request.segment,
    request.parameters,
    async () => {
      const load = () => fetchBlob(request, signal);
      return blobToImage(await (queue ? queue.run(load, queueSignal) : load()));
    },
    signal,
  );
}

/**
 * Background loads, two at a time. Images on screen are requested directly,
 * so they never wait behind a prefetch.
 */
const PREFETCH_QUEUE = createLoadQueue(2);

/**
 * Loads images ahead of time, in the given order, so they show at once when
 * they are needed. Aborting `signal` drops the ones still waiting; one already
 * requested finishes and lands in the cache, so a view opened meanwhile joins it.
 */
export function prefetchImages(requests: ImageRequest[], signal: AbortSignal): void {
  for (const request of requests) {
    if (getCachedImage(request)) continue;
    loadImage(request, { queue: PREFETCH_QUEUE, queueSignal: signal }).catch((error) => {
      if (!isAbortError(error)) console.warn("Failed to prefetch spectrogram image:", error);
    });
  }
}
