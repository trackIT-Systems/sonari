import { describe, expect, it } from "vitest";

import { matchWindowScaleRatio } from "./windows";

import type { Dimensions, SpectrogramWindow } from "@/types";

const MAIN: Dimensions = { width: 1000, height: 384 };
const PANEL: Dimensions = { width: 448, height: 224 };

/** Pixels per second divided by pixels per Hz: how a window is stretched. */
function scaleRatio(window: SpectrogramWindow, dimensions: Dimensions) {
  const duration = window.time.max - window.time.min;
  const bandwidth = window.freq.max - window.freq.min;
  return (dimensions.width / duration) / (dimensions.height / bandwidth);
}

describe("matchWindowScaleRatio", () => {
  const reference: SpectrogramWindow = {
    time: { min: 10, max: 12 },
    freq: { min: 0, max: 48_000 },
  };

  it("gives the window the same scale ratio as the reference", () => {
    const window: SpectrogramWindow = {
      time: { min: 10.5, max: 10.6 },
      freq: { min: 20_000, max: 30_000 },
    };

    const matched = matchWindowScaleRatio({
      window,
      dimensions: PANEL,
      reference,
      referenceDimensions: MAIN,
    });

    expect(scaleRatio(matched, PANEL)).toBeCloseTo(scaleRatio(reference, MAIN), 6);
  });

  it("only ever grows the window, keeping it centred", () => {
    const window: SpectrogramWindow = {
      time: { min: 10.5, max: 10.6 },
      freq: { min: 20_000, max: 30_000 },
    };

    const matched = matchWindowScaleRatio({
      window,
      dimensions: PANEL,
      reference,
      referenceDimensions: MAIN,
    });

    expect(matched.time.min).toBeLessThanOrEqual(window.time.min);
    expect(matched.time.max).toBeGreaterThanOrEqual(window.time.max);
    expect(matched.freq.min).toBeLessThanOrEqual(window.freq.min);
    expect(matched.freq.max).toBeGreaterThanOrEqual(window.freq.max);
    expect(matched.time.min + matched.time.max).toBeCloseTo(
      window.time.min + window.time.max,
      6,
    );
    expect(matched.freq.min + matched.freq.max).toBeCloseTo(
      window.freq.min + window.freq.max,
      6,
    );
  });

  it("stretches the frequency axis when the window is too wide in time", () => {
    const window: SpectrogramWindow = {
      time: { min: 10, max: 11 },
      freq: { min: 20_000, max: 20_100 },
    };

    const matched = matchWindowScaleRatio({
      window,
      dimensions: PANEL,
      reference,
      referenceDimensions: MAIN,
    });

    expect(matched.time.max - matched.time.min).toBeCloseTo(1, 6);
    expect(matched.freq.max - matched.freq.min).toBeGreaterThan(100);
    expect(scaleRatio(matched, PANEL)).toBeCloseTo(scaleRatio(reference, MAIN), 6);
  });

  it("leaves degenerate windows alone", () => {
    const window: SpectrogramWindow = {
      time: { min: 10, max: 10 },
      freq: { min: 0, max: 1000 },
    };

    expect(
      matchWindowScaleRatio({
        window,
        dimensions: PANEL,
        reference,
        referenceDimensions: MAIN,
      }),
    ).toEqual(window);
  });
});
