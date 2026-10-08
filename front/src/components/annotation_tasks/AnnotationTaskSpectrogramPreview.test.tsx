import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_SPECTROGRAM_PARAMETERS } from "@/api/spectrograms";
import useStore from "@/store";
import type { AnnotationTask } from "@/types";

const previewImage = vi.fn();
const drawAllFrequencyLines = vi.fn();
let drawCanvas: ((ctx: CanvasRenderingContext2D) => void) | undefined;

vi.mock("@/hooks/spectrogram/useSpectrogramPreviewImage", () => ({
  default: (args: unknown) => {
    previewImage(args);
    return { image: { width: 10, height: 10 }, isError: false, isLoading: false };
  },
}));
vi.mock("@/hooks/draw/useCanvas", () => ({
  default: ({ draw }: { draw: (ctx: CanvasRenderingContext2D) => void }) => {
    drawCanvas = draw;
  },
}));
vi.mock("@/draw/freqLines", () => ({
  drawAllFrequencyLines: (...args: unknown[]) => drawAllFrequencyLines(...args),
}));

import AnnotationTaskSpectrogramPreview from "./AnnotationTaskSpectrogramPreview";

const task = {
  id: 1,
  recording_id: 7,
  start_time: 100,
  end_time: 105,
  recording: { id: 7, samplerate: 96000, channels: 2 },
} as AnnotationTask;

function fakeCtx() {
  return {
    canvas: { width: 1000, height: 160 },
    fillRect: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

describe("AnnotationTaskSpectrogramPreview", () => {
  beforeEach(() => {
    previewImage.mockClear();
    drawAllFrequencyLines.mockClear();
    drawCanvas = undefined;
    useStore.getState().setSpectrogramSettings({
      ...DEFAULT_SPECTROGRAM_PARAMETERS,
      cmap: "viridis",
      scale: "power",
      channel: 1,
      freqLines: [20000, 40000],
    });
  });

  it("requests the image with the saved spectrogram parameters", () => {
    render(<AnnotationTaskSpectrogramPreview task={task} />);

    const { parameters } = previewImage.mock.calls.at(-1)![0];
    expect(parameters).toMatchObject({
      cmap: "viridis",
      scale: "power",
      channel: 1,
    });
  });

  it("keeps frequency lines out of the request so they do not refetch the image", () => {
    render(<AnnotationTaskSpectrogramPreview task={task} />);

    const { parameters } = previewImage.mock.calls.at(-1)![0];
    expect(parameters.freqLines).toEqual([]);
  });

  it("falls back to the first channel when the saved one does not exist", () => {
    useStore.getState().setSpectrogramSettings({
      ...DEFAULT_SPECTROGRAM_PARAMETERS,
      channel: 3,
    });
    render(<AnnotationTaskSpectrogramPreview task={task} />);

    expect(previewImage.mock.calls.at(-1)![0].parameters.channel).toBe(0);
  });

  it("draws the saved frequency lines over the task's frequency range", () => {
    render(<AnnotationTaskSpectrogramPreview task={task} />);
    drawCanvas!(fakeCtx());

    expect(drawAllFrequencyLines).toHaveBeenCalledWith(
      expect.anything(),
      [20000, 40000],
      { time: { min: 100, max: 105 }, freq: { min: 0, max: 48000 } },
    );
  });
});
