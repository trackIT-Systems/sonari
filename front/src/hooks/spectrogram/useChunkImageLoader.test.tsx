import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import useChunkImageLoader, {
  useDetailLevelFallback,
  type ChunkWithImage,
} from "@/hooks/spectrogram/useChunkImageLoader";
import type { Chunk } from "@/utils/chunks";

afterEach(() => {
  cleanup();
});

/** Evenly sized chunks covering 0..duration. */
function layout(duration: number, count: number): Chunk[] {
  const size = duration / count;
  return Array.from({ length: count }, (_, index) => ({
    index,
    interval: { min: index * size, max: (index + 1) * size },
    buffer: { min: index * size, max: (index + 1) * size },
  }));
}

/** An "image" remembering the chunk it was loaded for. */
function imageFor(chunk: Chunk) {
  return { loadedFor: chunk.interval } as unknown as HTMLImageElement;
}

function loadedFor(image: HTMLImageElement | null) {
  return (image as unknown as { loadedFor: Chunk["interval"] }).loadedFor;
}

describe("useChunkImageLoader", () => {
  it("never shows an image at the position of another layout's chunk", async () => {
    const fine = layout(10, 10);
    const coarse = layout(10, 2);
    const renders: ChunkWithImage[][] = [];

    const { rerender } = renderHook(
      ({ chunks }: { chunks: Chunk[] }) => {
        const result = useChunkImageLoader({
          allChunks: chunks,
          visibleChunks: chunks,
          chunksToLoad: chunks,
          resetKey: "params",
          enabled: true,
          load: async (chunk) => imageFor(chunk),
          maxConcurrent: 10,
        });
        renders.push(result.chunks);
        return result;
      },
      { initialProps: { chunks: fine } },
    );
    await waitFor(() => expect(renders.at(-1)).toHaveLength(10));

    // Switch to a layout whose chunk indices mean other time ranges
    rerender({ chunks: coarse });
    await waitFor(() => expect(renders.at(-1)).toHaveLength(2));

    // In every single render, each image is drawn where it was loaded for
    for (const chunks of renders) {
      for (const { chunk, image } of chunks) {
        expect(loadedFor(image)).toEqual(chunk.interval);
      }
    }
  });

  it("reports loading, not loaded, right after the layout changes", async () => {
    const fine = layout(10, 10);
    const coarse = layout(10, 2);
    const loadingStates: boolean[] = [];
    let release: () => void = () => undefined;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });

    const { rerender } = renderHook(
      ({ chunks }: { chunks: Chunk[] }) => {
        const result = useChunkImageLoader({
          allChunks: chunks,
          visibleChunks: chunks,
          chunksToLoad: chunks,
          resetKey: "params",
          enabled: true,
          load: async (chunk) => {
            if (chunks === coarse) await blocked;
            return imageFor(chunk);
          },
          maxConcurrent: 10,
        });
        loadingStates.push(result.isLoading);
        return result;
      },
      { initialProps: { chunks: fine } },
    );
    await waitFor(() => expect(loadingStates.at(-1)).toBe(false));

    const before = loadingStates.length;
    rerender({ chunks: coarse });
    // Every render with the new layout is loading until its images arrive
    expect(loadingStates.slice(before).every(Boolean)).toBe(true);

    await act(async () => release());
    await waitFor(() => expect(loadingStates.at(-1)).toBe(false));
  });
});

describe("useDetailLevelFallback", () => {
  const a = { chunk: layout(10, 1)[0], image: imageFor(layout(10, 1)[0]), isLoading: false, isError: false };
  const b = { chunk: layout(10, 2)[0], image: imageFor(layout(10, 2)[0]), isLoading: false, isError: false };

  function renderFallback(initial: {
    level: number;
    resetKey: unknown;
    chunks: ChunkWithImage[];
    isLoading: boolean;
  }) {
    return renderHook((props: typeof initial) => useDetailLevelFallback(props), {
      initialProps: initial,
    });
  }

  it("keeps the previous level's chunks underneath while the new level loads", () => {
    const { result, rerender } = renderFallback({ level: 0, resetKey: "p", chunks: [a], isLoading: false });
    rerender({ level: 1, resetKey: "p", chunks: [], isLoading: true });
    expect(result.current).toEqual([a]);

    // Partially loaded: new chunks are drawn on top (last)
    rerender({ level: 1, resetKey: "p", chunks: [b], isLoading: true });
    expect(result.current).toEqual([a, b]);

    // Complete: the backdrop is dropped
    rerender({ level: 1, resetKey: "p", chunks: [b], isLoading: false });
    expect(result.current).toEqual([b]);
  });

  it("drops the backdrop when the parameters change, even together with the level", () => {
    const { result, rerender } = renderFallback({ level: 0, resetKey: "p", chunks: [a], isLoading: false });
    rerender({ level: 1, resetKey: "other", chunks: [], isLoading: true });
    expect(result.current).toEqual([]);
  });

  it("drops the backdrop when the parameters change while loading", () => {
    const { result, rerender } = renderFallback({ level: 0, resetKey: "p", chunks: [a], isLoading: false });
    rerender({ level: 1, resetKey: "p", chunks: [], isLoading: true });
    expect(result.current).toEqual([a]);
    rerender({ level: 1, resetKey: "other", chunks: [], isLoading: true });
    expect(result.current).toEqual([]);
  });

  it("returns the chunks unchanged while the level stays the same", () => {
    const chunks = [a];
    const { result, rerender } = renderFallback({ level: 0, resetKey: "p", chunks, isLoading: false });
    rerender({ level: 0, resetKey: "p", chunks, isLoading: true });
    expect(result.current).toBe(chunks);
  });
});
