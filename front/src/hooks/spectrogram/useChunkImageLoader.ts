import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Chunk } from "@/utils/chunks";

/** How often a failed chunk is retried before it is marked as errored. */
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;

type ChunkStatus = "loading" | "ready" | "error";

export interface ChunkWithImage {
  chunk: Chunk;
  image: HTMLImageElement | null;
  isLoading: boolean;
  isError: boolean;
}

/**
 * Loads chunk images with a bounded request queue.
 *
 * - At most `maxConcurrent` requests run at once, visible chunks first and
 *   closest to the viewport centre first. Zooming far out no longer fires
 *   one request per chunk, which saturated the browser connection pool
 *   (blocking audio and API calls) and the backend.
 * - Requests for chunks that leave `chunksToLoad` are aborted, so the queue
 *   always reflects the current viewport.
 * - Failed chunks are retried with backoff, and again whenever they become
 *   needed after leaving the viewport, instead of staying blank forever.
 * - Results that arrive after `resetKey` changed are discarded, so images
 *   rendered with old parameters are never shown.
 */
export default function useChunkImageLoader({
  allChunks,
  visibleChunks,
  chunksToLoad,
  resetKey,
  enabled,
  load,
  maxConcurrent,
  onAllVisibleLoaded,
}: {
  allChunks: Chunk[];
  visibleChunks: Chunk[];
  chunksToLoad: Chunk[];
  /** Any change invalidates all loaded images (e.g. new parameters). */
  resetKey: unknown;
  enabled: boolean;
  load: (chunk: Chunk, signal: AbortSignal) => Promise<HTMLImageElement>;
  maxConcurrent: number;
  onAllVisibleLoaded?: () => void;
}) {
  const [images, setImages] = useState<Map<number, HTMLImageElement>>(
    () => new Map(),
  );
  const [statuses, setStatuses] = useState<Map<number, ChunkStatus>>(
    () => new Map(),
  );

  const loadRef = useRef(load);
  loadRef.current = load;

  const generationRef = useRef(0);
  const wantedRef = useRef<Chunk[]>([]);
  const readyRef = useRef(new Set<number>());
  const inFlightRef = useRef(new Map<number, AbortController>());
  const failuresRef = useRef(new Map<number, number>());
  const retryTimersRef = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const setStatus = useCallback((index: number, status: ChunkStatus | null) => {
    setStatuses((prev) => {
      if ((prev.get(index) ?? null) === status) return prev;
      const next = new Map(prev);
      if (status == null) {
        next.delete(index);
      } else {
        next.set(index, status);
      }
      return next;
    });
  }, []);

  const cancelChunk = useCallback((index: number) => {
    inFlightRef.current.get(index)?.abort();
    inFlightRef.current.delete(index);
    const timer = retryTimersRef.current.get(index);
    if (timer != null) clearTimeout(timer);
    retryTimersRef.current.delete(index);
  }, []);

  /** Chunks with a request in flight or a retry scheduled. */
  const pendingIndices = useCallback(
    () =>
      Array.from(inFlightRef.current.keys()).concat(
        Array.from(retryTimersRef.current.keys()),
      ),
    [],
  );

  const pumpRef = useRef<() => void>(() => undefined);

  const start = useCallback(
    (chunk: Chunk) => {
      const index = chunk.index;
      const generation = generationRef.current;
      const controller = new AbortController();
      inFlightRef.current.set(index, controller);
      setStatus(index, "loading");

      loadRef
        .current(chunk, controller.signal)
        .then(
          (image) => {
            if (generation !== generationRef.current || controller.signal.aborted) {
              return;
            }
            readyRef.current.add(index);
            failuresRef.current.delete(index);
            setImages((prev) => new Map(prev).set(index, image));
            setStatus(index, "ready");
          },
          (error) => {
            if (generation !== generationRef.current) return;
            if (controller.signal.aborted) {
              setStatus(index, null);
              return;
            }
            const failures = (failuresRef.current.get(index) ?? 0) + 1;
            failuresRef.current.set(index, failures);
            if (failures > MAX_RETRIES) {
              console.error(`Failed to load chunk ${index}:`, error);
              setStatus(index, "error");
              return;
            }
            const delay = RETRY_BASE_DELAY_MS * 2 ** (failures - 1);
            retryTimersRef.current.set(
              index,
              setTimeout(() => {
                retryTimersRef.current.delete(index);
                pumpRef.current();
              }, delay),
            );
          },
        )
        .finally(() => {
          if (inFlightRef.current.get(index) === controller) {
            inFlightRef.current.delete(index);
          }
          if (generation === generationRef.current) {
            pumpRef.current();
          }
        });
    },
    [setStatus],
  );

  pumpRef.current = () => {
    for (const chunk of wantedRef.current) {
      if (inFlightRef.current.size >= maxConcurrent) return;
      const index = chunk.index;
      if (
        readyRef.current.has(index) ||
        inFlightRef.current.has(index) ||
        retryTimersRef.current.has(index) ||
        (failuresRef.current.get(index) ?? 0) > MAX_RETRIES
      ) {
        continue;
      }
      start(chunk);
    }
  };

  // Invalidate everything when the parameters or chunk layout change.
  // Declared before the queue effect so it runs first in the same commit.
  useEffect(() => {
    generationRef.current += 1;
    for (const index of pendingIndices()) {
      cancelChunk(index);
    }
    readyRef.current = new Set();
    failuresRef.current = new Map();
    setImages(new Map());
    setStatuses(new Map());
  }, [resetKey, allChunks, cancelChunk, pendingIndices]);

  // Re-prioritise the queue whenever the viewport changes.
  useEffect(() => {
    if (!enabled) {
      wantedRef.current = [];
    } else {
      wantedRef.current = prioritize(chunksToLoad, visibleChunks);
    }

    const wanted = new Set(wantedRef.current.map((chunk) => chunk.index));
    for (const index of pendingIndices()) {
      if (!wanted.has(index)) {
        cancelChunk(index);
        setStatus(index, null);
      }
    }
    // Give chunks that failed earlier a fresh set of retries next time
    // they are needed.
    for (const index of Array.from(failuresRef.current.keys())) {
      if (!wanted.has(index)) {
        failuresRef.current.delete(index);
        setStatus(index, null);
      }
    }

    pumpRef.current();
  }, [chunksToLoad, visibleChunks, enabled, resetKey, allChunks, cancelChunk, setStatus, pendingIndices]);

  // Abort everything on unmount.
  useEffect(() => {
    const inFlight = inFlightRef.current;
    const retryTimers = retryTimersRef.current;
    return () => {
      generationRef.current += 1;
      inFlight.forEach((controller) => controller.abort());
      retryTimers.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  const allVisibleLoaded =
    visibleChunks.length > 0 &&
    visibleChunks.every((chunk) => statuses.get(chunk.index) === "ready");

  useEffect(() => {
    if (allVisibleLoaded) onAllVisibleLoaded?.();
  }, [allVisibleLoaded, onAllVisibleLoaded]);

  // Return all chunks that have loaded images, not just visible ones.
  // This prevents flickering during scroll by keeping loaded chunks visible.
  const chunksWithImages: ChunkWithImage[] = useMemo(
    () =>
      allChunks
        .filter((chunk) => images.has(chunk.index))
        .map((chunk) => ({
          chunk,
          image: images.get(chunk.index) ?? null,
          isLoading: false,
          isError: false,
        })),
    [allChunks, images],
  );

  return {
    chunks: chunksWithImages,
    /** True while any visible chunk is still missing. */
    isLoading: enabled && visibleChunks.length > 0 && !allVisibleLoaded,
    isError: visibleChunks.some((chunk) => statuses.get(chunk.index) === "error"),
  };
}

/** Visible chunks first, each group ordered by distance to the viewport centre. */
function prioritize(chunksToLoad: Chunk[], visibleChunks: Chunk[]): Chunk[] {
  if (visibleChunks.length === 0) return chunksToLoad;
  const visible = new Set(visibleChunks.map((chunk) => chunk.index));
  const first = visibleChunks[0].index;
  const last = visibleChunks[visibleChunks.length - 1].index;
  const centre = (first + last) / 2;
  return [...chunksToLoad].sort((a, b) => {
    const aVisible = visible.has(a.index) ? 0 : 1;
    const bVisible = visible.has(b.index) ? 0 : 1;
    if (aVisible !== bVisible) return aVisible - bVisible;
    return Math.abs(a.index - centre) - Math.abs(b.index - centre);
  });
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
