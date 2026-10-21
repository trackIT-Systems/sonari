import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_SPECTROGRAM_PARAMETERS } from "@/api/spectrograms";
import useWaveformImages from "@/hooks/spectrogram/useWaveformImages";
import { spectrogramCache } from "@/utils/spectrogram_cache";
import type { Recording, SpectrogramParameters } from "@/types";

type Request = {
  segment: { min: number; max: number };
  parameters: SpectrogramParameters;
  resolve?: (blob: Blob) => void;
};

const requests: Request[] = [];

vi.mock("@/app/api", () => ({
  default: {
    waveforms: {
      // Resolved by the test through `request.resolve`
      getBlob: vi.fn(
        (args: Request) =>
          new Promise<Blob>((resolve) => {
            requests.push({ ...args, resolve });
          }),
      ),
    },
  },
}));

// samplerate 256 kHz, 512 window, 50% overlap -> 1 ms per full resolution column.
const SAMPLERATE = 256000;
const PARAMS: SpectrogramParameters = {
  ...DEFAULT_SPECTROGRAM_PARAMETERS,
  auto_stft: false,
  window_size_samples: 512,
  overlap_percent: 50,
};

const recording = { id: 1, duration: 60, samplerate: SAMPLERATE } as Recording;

function renderWaveform(min: number, max: number) {
  return renderHook(
    (props: { min: number; max: number }) =>
      useWaveformImages({
        recording,
        window: { time: { min: props.min, max: props.max } },
        parameters: PARAMS,
        withSpectrogram: true,
      }),
    { initialProps: { min, max } },
  );
}

/** Image stub that "decodes" immediately. */
class FakeImage {
  onload: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  width = 10;
  height = 10;
  complete = true;
  set src(_: string) {
    queueMicrotask(() => this.onload?.());
  }
  decode() {
    return Promise.resolve();
  }
}

function resolveAll() {
  for (const r of requests.splice(0)) r.resolve?.(new Blob(["x"]));
}

beforeEach(() => {
  requests.length = 0;
  spectrogramCache.clear();
  vi.stubGlobal("Image", FakeImage);
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: () => `blob:${Math.random()}`,
    revokeObjectURL: () => undefined,
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useWaveformImages", () => {
  it("requests full resolution chunks when zoomed in", async () => {
    renderWaveform(0, 1);
    await waitFor(() => expect(requests.length).toBeGreaterThan(0));
    for (const r of requests) {
      expect(r.parameters.max_columns).toBeUndefined();
    }
  });

  it("loads few coarse chunks when zoomed out", async () => {
    // 60000 columns for a 1000 px canvas: level 5, 32 ms per column.
    renderWaveform(0, 60);
    await waitFor(() => expect(requests.length).toBeGreaterThan(0));
    for (const r of requests) {
      const columns = (r.segment.max - r.segment.min) / 0.032;
      expect(r.parameters.max_columns).toBe(Math.round(columns));
    }
    // A full resolution chunk spans ~0.67 s, so 60 s used to need ~90 chunks.
    expect(requests[0].segment.max - requests[0].segment.min).toBeGreaterThan(20);
  });

  it("keeps the previous level on screen until the new level has loaded", async () => {
    const { result, rerender } = renderWaveform(0, 1);
    await waitFor(() => expect(requests.length).toBeGreaterThan(0));
    await waitFor(() => {
      resolveAll();
      expect(result.current.isLoading).toBe(false);
    });
    const before = result.current.chunks.map((c) => c.image);
    expect(before.length).toBeGreaterThan(0);

    rerender({ min: 0, max: 60 });
    await waitFor(() => expect(requests.length).toBeGreaterThan(0));
    expect(result.current.isLoading).toBe(true);
    expect(result.current.chunks.map((c) => c.image)).toEqual(expect.arrayContaining(before));

    await waitFor(() => {
      resolveAll();
      expect(result.current.isLoading).toBe(false);
    });
    await act(async () => undefined);
    for (const image of before) {
      expect(result.current.chunks.map((c) => c.image)).not.toContain(image);
    }
  });
});
