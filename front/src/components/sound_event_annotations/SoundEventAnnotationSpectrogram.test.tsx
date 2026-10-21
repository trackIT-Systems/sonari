import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_SPECTROGRAM_PARAMETERS } from "@/api/spectrograms";
import type { AnnotationTask, SoundEventAnnotation } from "@/types";

let drawCanvas: ((ctx: CanvasRenderingContext2D) => void) | undefined;
const spectrogramDraw = vi.fn();
const useSpectrogramMock = vi.fn();

vi.mock("@/hooks/draw/useCanvas", () => ({
  default: ({ draw }: { draw: (ctx: CanvasRenderingContext2D) => void }) => {
    drawCanvas = draw;
  },
}));
vi.mock("@/hooks/spectrogram/useSpectrogram", () => ({
  default: (args: unknown) => {
    useSpectrogramMock(args);
    return {
      draw: spectrogramDraw,
      window: { time: { min: 0, max: 1 }, freq: { min: 0, max: 1000 } },
      props: {},
      zoom: vi.fn(),
      scale: vi.fn(),
      isLoading: false,
      canZoom: false,
      enableZoom: vi.fn(),
    };
  },
}));
vi.mock("@/hooks/draw/useCreateLineString", () => ({
  default: () => ({ props: {}, draw: vi.fn() }),
}));
vi.mock("./SoundEventAnnotationPSD", () => ({ default: () => null }));

import SoundEventAnnotationSpectrogramView from "./SoundEventAnnotationSpectrogram";

const task = { id: 1, recording_id: 1, start_time: 0, end_time: 1 } as AnnotationTask;
const annotation = {
  id: 1,
  geometry_type: "BoundingBox",
  geometry: { type: "BoundingBox", coordinates: [0.2, 1000, 0.3, 2000] },
} as unknown as SoundEventAnnotation;

const originalRatio = window.devicePixelRatio;

function setRatio(value: number) {
  Object.defineProperty(window, "devicePixelRatio", { value, configurable: true });
}

function renderView() {
  return render(
    <SoundEventAnnotationSpectrogramView
      soundEventAnnotation={annotation}
      task={task}
      samplerate={8000}
      parameters={DEFAULT_SPECTROGRAM_PARAMETERS}
      withSpectrogram
    />,
  );
}

beforeEach(() => {
  drawCanvas = undefined;
  spectrogramDraw.mockClear();
  useSpectrogramMock.mockClear();
});

afterEach(() => {
  setRatio(originalRatio);
});

describe("SoundEventAnnotationSpectrogramView", () => {
  it("renders the canvas at screen resolution with its CSS size unchanged", () => {
    setRatio(2);
    const { container } = renderView();
    const canvas = container.querySelector("canvas")!;
    expect(canvas.width).toBe(896);
    expect(canvas.height).toBe(448);
    expect(canvas.style.width).toBe("448px");
    expect(canvas.style.height).toBe("224px");
  });

  it("draws in CSS pixels, scaled onto the backing store, with smoothing", () => {
    setRatio(2);
    renderView();
    const ctx = {
      canvas: { width: 896, height: 448 },
      setTransform: vi.fn(),
      imageSmoothingEnabled: false,
      imageSmoothingQuality: "low",
    };
    drawCanvas!(ctx as unknown as CanvasRenderingContext2D);

    expect(ctx.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
    expect(ctx.imageSmoothingEnabled).toBe(true);
    expect(ctx.imageSmoothingQuality).toBe("high");
    expect(spectrogramDraw).toHaveBeenCalled();
  });

  it("loads detail for the physical pixels", () => {
    setRatio(2);
    renderView();
    const args = useSpectrogramMock.mock.calls.at(-1)![0];
    expect(args.pixelRatio).toBe(2);
    expect(args.dimensions).toEqual({ width: 448, height: 224 });
  });

  it("keeps a plain canvas on standard screens", () => {
    setRatio(1);
    const { container } = renderView();
    expect(container.querySelector("canvas")!.width).toBe(448);
  });
});
