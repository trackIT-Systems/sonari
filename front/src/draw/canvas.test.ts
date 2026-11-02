import { describe, expect, it } from "vitest";

import { getCanvasSize } from "./canvas";

function fakeCtx(width: number, height: number, scale?: { a: number; d: number }) {
  return {
    canvas: { width, height },
    ...(scale && { getTransform: () => scale }),
  } as unknown as CanvasRenderingContext2D;
}

describe("getCanvasSize", () => {
  it("is the canvas size for an unscaled canvas", () => {
    expect(getCanvasSize(fakeCtx(1000, 384, { a: 1, d: 1 }))).toEqual({ width: 1000, height: 384 });
  });

  it("is the CSS size for a canvas drawn at screen resolution", () => {
    expect(getCanvasSize(fakeCtx(896, 448, { a: 2, d: 2 }))).toEqual({ width: 448, height: 224 });
  });

  it("falls back to the canvas size without a transform", () => {
    expect(getCanvasSize(fakeCtx(448, 224))).toEqual({ width: 448, height: 224 });
  });
});
