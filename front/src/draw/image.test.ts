import { describe, expect, it, vi } from "vitest";

import { drawStitchedImage } from "./image";

/** A context whose backing store is `scale` times the CSS size, scaled by a transform. */
function fakeCtx(scale: number) {
  return {
    canvas: { width: 448 * scale, height: 224 * scale },
    getTransform: () => ({ a: scale, d: scale }),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    fillStyle: "",
    globalAlpha: 1,
  };
}

const chunk = {
  chunk: { index: 0, interval: { min: 0, max: 1 }, buffer: { min: 0, max: 1 } },
  image: { width: 100, height: 50 } as HTMLImageElement,
  isLoading: false,
  isError: false,
};

describe("drawStitchedImage", () => {
  it.each([1, 2])("draws in CSS pixels at pixel ratio %i", (scale) => {
    const ctx = fakeCtx(scale);
    drawStitchedImage({
      ctx: ctx as unknown as CanvasRenderingContext2D,
      viewport: { time: { min: 0, max: 0.5 }, freq: { min: 0, max: 1000 } },
      chunks: [chunk],
      samplerate: 2000,
    });

    // The transform scales to the backing store, so the image fills 448x224 units
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 448, 224);
    const [, , , , , dx, dy, dw, dh] = ctx.drawImage.mock.calls[0];
    expect([dx, dy, dw, dh]).toEqual([0, 0, 448 + 1, 224]);
  });
});
