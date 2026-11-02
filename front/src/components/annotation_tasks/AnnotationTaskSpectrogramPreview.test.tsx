import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_SPECTROGRAM_PARAMETERS } from "@/api/spectrograms";
import useStore from "@/store";
import type { AnnotationTask } from "@/types";

const previewImage = vi.fn();
const drawAllFrequencyLines = vi.fn();
const drawFrequencyLines = vi.fn();
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
  drawFrequencyLines: (...args: unknown[]) => drawFrequencyLines(...args),
}));

import AnnotationTaskSpectrogramPreview, {
  getFrequencyTicks,
  nextPreviewChannel,
} from "./AnnotationTaskSpectrogramPreview";

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
  // Unmount between tests: queries search the whole document
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    previewImage.mockClear();
    drawAllFrequencyLines.mockClear();
    drawFrequencyLines.mockClear();
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

  it("caps the requested columns so long tasks stay cheap to compute", () => {
    render(<AnnotationTaskSpectrogramPreview task={task} />);

    const { parameters } = previewImage.mock.calls.at(-1)![0];
    expect(parameters).toMatchObject({
      overlap_percent: 99,
      max_columns: 2000,
      max_rows: 320,
      lossy: true,
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

  describe("frequency range and reference line", () => {
    const batTask = {
      ...task,
      recording: { id: 7, samplerate: 384000, channels: 2 },
    } as AnnotationTask;

    it("shows only up to 150 kHz, cropping the top of the image", () => {
      previewImage.mockClear();
      render(<AnnotationTaskSpectrogramPreview task={batTask} />);
      const ctx = fakeCtx();
      drawCanvas!(ctx);

      // The mocked image is 10x10 and covers 0-192 kHz: skip the top 42 kHz
      const [, sx, sy, sw, sh, dx, dy, dw, dh] = (ctx.drawImage as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(sx).toBe(0);
      expect(sy).toBeCloseTo(10 * (1 - 150000 / 192000));
      expect(sw).toBe(10);
      expect(sy + sh).toBeCloseTo(10);
      expect([dx, dy, dw, dh]).toEqual([0, 0, 1000, 160]);

      // Lines are drawn over the visible range
      expect(drawAllFrequencyLines.mock.calls[0][2].freq).toEqual({ min: 0, max: 150000 });
    });

    it("labels the frequency axis up to 150 kHz", () => {
      const { container } = render(<AnnotationTaskSpectrogramPreview task={batTask} />);
      const labels = Array.from(container.querySelectorAll("span"))
        .map((span) => span.textContent ?? "")
        .filter((text) => /^\d+k$/.test(text))
        .map((text) => Number(text.slice(0, -1)));
      expect(labels.length).toBeGreaterThan(0);
      expect(Math.max(...labels)).toBeLessThan(150);
      // Ticks are placed on the 0-150 kHz scale: 100k sits a third from the top
      const tick = Array.from(container.querySelectorAll("span")).find((span) => span.textContent === "100k");
      expect((tick?.parentElement as HTMLElement).style.top).toBe(`${(1 - 100 / 150) * 100}%`);
    });

    it("requests enough rows for the part shown", () => {
      render(<AnnotationTaskSpectrogramPreview task={batTask} />);
      expect(previewImage.mock.calls.at(-1)![0].parameters.max_rows).toBe(Math.round((320 * 192000) / 150000));
    });

    it("shows the whole range for recordings below 300 kHz", () => {
      render(<AnnotationTaskSpectrogramPreview task={task} />);
      const ctx = fakeCtx();
      drawCanvas!(ctx);
      expect((ctx.drawImage as ReturnType<typeof vi.fn>).mock.calls[0].slice(1, 5)).toEqual([0, 0, 10, 10]);
      expect(previewImage.mock.calls.at(-1)![0].parameters.max_rows).toBe(320);
    });

    it("has a dashed 40 kHz guide instead of 50 kHz, and no drawn reference line", () => {
      const { container } = render(<AnnotationTaskSpectrogramPreview task={batTask} />);
      const labels = Array.from(container.querySelectorAll("span")).map((span) => span.textContent);
      expect(labels).toContain("40k");
      expect(labels).toContain("100k");
      expect(labels).not.toContain("50k");
      const guide = Array.from(container.querySelectorAll("span")).find((span) => span.textContent === "40k");
      const line = guide!.parentElement!.querySelector("div")!;
      expect(line.className).toContain("border-dashed");

      useStore.getState().setSpectrogramSettings({ ...DEFAULT_SPECTROGRAM_PARAMETERS, freqLines: [] });
      drawCanvas!(fakeCtx());
      expect(drawFrequencyLines).not.toHaveBeenCalled();
    });
  });

  describe("channel", () => {
    const stereo = { ...task, recording: { id: 7, samplerate: 96000, channels: 2 } } as AnnotationTask;

    it("shows the chosen channel on its own instead of the saved one", () => {
      useStore.getState().setSpectrogramSettings({
        ...DEFAULT_SPECTROGRAM_PARAMETERS,
        channel: 0,
        mix_channels: true,
      });
      render(<AnnotationTaskSpectrogramPreview task={stereo} channel={1} />);
      expect(previewImage.mock.calls.at(-1)![0].parameters).toMatchObject({
        channel: 1,
        mix_channels: false,
      });
    });

    it("uses the saved channel and mixing when none is chosen", () => {
      useStore.getState().setSpectrogramSettings({
        ...DEFAULT_SPECTROGRAM_PARAMETERS,
        channel: 1,
        mix_channels: true,
      });
      render(<AnnotationTaskSpectrogramPreview task={stereo} />);
      expect(previewImage.mock.calls.at(-1)![0].parameters).toMatchObject({
        channel: 1,
        mix_channels: true,
      });
    });

    it("offers a button per channel and Mix, and reports the choice", () => {
      const onChannelChange = vi.fn();
      const { getByRole } = render(
        <AnnotationTaskSpectrogramPreview task={stereo} channel={0} onChannelChange={onChannelChange} />,
      );
      expect(getByRole("button", { name: "Ch 1" }).getAttribute("aria-pressed")).toBe("true");
      expect(getByRole("button", { name: "Ch 2" }).getAttribute("aria-pressed")).toBe("false");
      expect(getByRole("button", { name: "Mix" }).getAttribute("aria-pressed")).toBe("false");
      fireEvent.click(getByRole("button", { name: "Ch 2" }));
      expect(onChannelChange).toHaveBeenLastCalledWith(1);
      fireEvent.click(getByRole("button", { name: "Mix" }));
      expect(onChannelChange).toHaveBeenLastCalledWith("mix");
    });

    it("mixes all channels when Mix is chosen", () => {
      useStore.getState().setSpectrogramSettings({
        ...DEFAULT_SPECTROGRAM_PARAMETERS,
        channel: 1,
        mix_channels: false,
      });
      const { getByRole } = render(
        <AnnotationTaskSpectrogramPreview task={stereo} channel="mix" onChannelChange={vi.fn()} />,
      );
      expect(previewImage.mock.calls.at(-1)![0].parameters.mix_channels).toBe(true);
      expect(getByRole("button", { name: "Mix" }).getAttribute("aria-pressed")).toBe("true");
      expect(getByRole("button", { name: "Ch 2" }).getAttribute("aria-pressed")).toBe("false");
    });

    it("highlights Mix when the saved settings mix the channels", () => {
      useStore.getState().setSpectrogramSettings({
        ...DEFAULT_SPECTROGRAM_PARAMETERS,
        mix_channels: true,
      });
      const { getByRole } = render(
        <AnnotationTaskSpectrogramPreview task={stereo} onChannelChange={vi.fn()} />,
      );
      expect(getByRole("button", { name: "Mix" }).getAttribute("aria-pressed")).toBe("true");
    });

    it("falls back to the first channel when the chosen one does not exist", () => {
      const mono = { ...task, recording: { id: 7, samplerate: 96000, channels: 1 } } as AnnotationTask;
      const { queryByRole } = render(
        <AnnotationTaskSpectrogramPreview task={mono} channel={1} onChannelChange={vi.fn()} />,
      );
      expect(previewImage.mock.calls.at(-1)![0].parameters.channel).toBe(0);
      // No switcher for a single channel
      expect(queryByRole("group", { name: "Channel" })).toBeNull();
    });
  });
});

describe("nextPreviewChannel", () => {
  it("goes through each channel, then Mix, then back to the first", () => {
    expect(nextPreviewChannel(0, 3)).toBe(1);
    expect(nextPreviewChannel(1, 3)).toBe(2);
    expect(nextPreviewChannel(2, 3)).toBe("mix");
    expect(nextPreviewChannel("mix", 3)).toBe(0);
  });

  it("treats a channel the recording lacks as its first", () => {
    expect(nextPreviewChannel(3, 2)).toBe(1);
  });
});

describe("getFrequencyTicks", () => {
  it("replaces the 50 kHz guide by 40 kHz on a 0-150 kHz scale", () => {
    expect(getFrequencyTicks(150_000)).toEqual([40, 100]);
  });

  it("does not repeat 40 kHz when it is a regular guide", () => {
    expect(getFrequencyTicks(48_000)).toEqual([20, 40]);
  });

  it("leaves 40 kHz out when it is above the range", () => {
    expect(getFrequencyTicks(24_000)).not.toContain(40);
  });
});
