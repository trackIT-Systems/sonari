import { describe, expect, it } from "vitest";

import { calculateSpectrogramChunks, getDetailLevel } from "./chunks";

// 256 kHz, 512 window, 50% overlap -> 1 ms hop.
const STFT = { windowSize: 512, overlap: 0.5, samplerate: 256000 };

describe("getDetailLevel", () => {
  it("uses full resolution while there are fewer columns than pixels", () => {
    expect(getDetailLevel({ ...STFT, viewportDuration: 1, canvasWidth: 1000 })).toBe(0);
  });

  it("picks the coarsest power of two that keeps a column per pixel", () => {
    // 60000 columns for 1000 px: 32 hops per column gives 1875 columns.
    expect(getDetailLevel({ ...STFT, viewportDuration: 60, canvasWidth: 1000 })).toBe(5);
  });

  it("stays on one level while zooming within a factor of two", () => {
    const at = (duration: number) =>
      getDetailLevel({ ...STFT, viewportDuration: duration, canvasWidth: 1000 });
    expect(at(33)).toBe(at(60));
  });
});

describe("calculateSpectrogramChunks", () => {
  it("makes chunks longer by the decimation factor", () => {
    const full = calculateSpectrogramChunks({ ...STFT, duration: 600 });
    const coarse = calculateSpectrogramChunks({ ...STFT, duration: 600, decimation: 32 });
    const length = (chunks: typeof full) => chunks[0].interval.max - chunks[0].interval.min;
    expect(length(coarse)).toBeCloseTo(length(full) * 32);
    expect(coarse.length).toBe(Math.ceil(full.length / 32));
  });
});
