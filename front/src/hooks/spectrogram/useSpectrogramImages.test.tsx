import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_SPECTROGRAM_PARAMETERS } from "@/api/spectrograms";
import useSpectrogramImages from "@/hooks/spectrogram/useSpectrogramImages";
import { spectrogramCache } from "@/utils/spectrogram_cache";
import type {
  AnnotationTask,
  SpectrogramParameters,
  SpectrogramWindow,
} from "@/types";

type PendingRequest = {
  segment: { min: number; max: number };
  parameters: SpectrogramParameters;
  signal?: AbortSignal;
  resolve: (blob: Blob) => void;
  reject: (error: unknown) => void;
};

const pending: PendingRequest[] = [];
let inFlight = 0;
let maxInFlight = 0;

vi.mock("@/app/api", () => ({
  default: {
    spectrograms: {
      getBlob: vi.fn(
        (args: {
          segment: { min: number; max: number };
          parameters: SpectrogramParameters;
          signal?: AbortSignal;
        }) =>
          new Promise<Blob>((resolve, reject) => {
            inFlight += 1;
            maxInFlight = Math.max(maxInFlight, inFlight);
            const done = () => {
              inFlight -= 1;
            };
            const request: PendingRequest = {
              segment: args.segment,
              parameters: args.parameters,
              signal: args.signal,
              resolve: (blob) => {
                done();
                resolve(blob);
              },
              reject: (error) => {
                done();
                reject(error);
              },
            };
            args.signal?.addEventListener("abort", () => {
              request.reject(new DOMException("Aborted", "AbortError"));
            });
            pending.push(request);
          }),
      ),
    },
  },
}));

/** Image stub: "decodes" immediately and remembers which blob it came from. */
class FakeImage {
  onload: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  width = 10;
  height = 10;
  complete = true;
  private _src = "";
  get src() {
    return this._src;
  }
  set src(value: string) {
    this._src = value;
    queueMicrotask(() => this.onload?.());
  }
  decode() {
    return Promise.resolve();
  }
}

// samplerate 256 kHz, 512 window, 50% overlap -> 1 ms hop -> 0.576 s chunks.
// A 60 s task therefore has 105 chunks.
const SAMPLERATE = 256000;
const PARAMS: SpectrogramParameters = {
  ...DEFAULT_SPECTROGRAM_PARAMETERS,
  auto_stft: false,
  window_size_samples: 512,
  overlap_percent: 50,
};

const task = {
  id: 1,
  recording_id: 1,
  start_time: 0,
  end_time: 60,
} as AnnotationTask;

function win(min: number, max: number): SpectrogramWindow {
  return { time: { min, max }, freq: { min: 0, max: SAMPLERATE / 2 } };
}

function resolveAll(filter: (r: PendingRequest) => boolean = () => true) {
  const toResolve = pending.filter((r) => !r.signal?.aborted && filter(r));
  for (const r of toResolve) {
    pending.splice(pending.indexOf(r), 1);
    r.resolve(new Blob([`${r.segment.min}-${r.parameters.window_size_samples}`]));
  }
}

beforeEach(() => {
  pending.length = 0;
  inFlight = 0;
  maxInFlight = 0;
  spectrogramCache.clear();
  vi.stubGlobal("Image", FakeImage);
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: (blob: Blob) => `blob:${(blob as Blob).size}-${Math.random()}`,
    revokeObjectURL: () => undefined,
  });
});

afterEach(async () => {
  // Settle leftovers so in-flight cache entries don't leak between tests.
  for (const r of pending.splice(0)) {
    r.reject(new Error("test cleanup"));
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function renderImages(window: SpectrogramWindow, parameters = PARAMS) {
  return renderHook(
    (props: { window: SpectrogramWindow; parameters: SpectrogramParameters }) =>
      useSpectrogramImages({
        task,
        samplerate: SAMPLERATE,
        window: props.window,
        parameters: props.parameters,
        withSpectrogram: true,
      }),
    { initialProps: { window, parameters } },
  );
}

describe("useSpectrogramImages", () => {
  it("limits the number of concurrent chunk requests when zoomed far out", async () => {
    renderImages(win(0, 60));
    await waitFor(() => expect(pending.length).toBeGreaterThan(0));
    // Without a limit all ~105 chunks are requested at once, which saturates
    // the browser connection pool and the backend.
    expect(maxInFlight).toBeLessThanOrEqual(6);
  });

  it("aborts requests for chunks that are no longer needed after zooming in", async () => {
    const { rerender } = renderImages(win(0, 60));
    await waitFor(() => expect(pending.length).toBeGreaterThan(0));
    // Jump to the far end of the task; the queue for the start is now useless.
    rerender({ window: win(59, 60), parameters: PARAMS });
    await waitFor(() =>
      expect(pending.some((r) => r.segment.min > 58)).toBe(true),
    );
    const stale = pending.filter((r) => r.segment.max < 50 && !r.signal?.aborted);
    expect(stale).toHaveLength(0);
  });

  it("loads the visible chunks after zooming out and back in", async () => {
    const { result, rerender } = renderImages(win(0, 1));
    await waitFor(() => expect(pending.length).toBeGreaterThan(0));
    rerender({ window: win(0, 60), parameters: PARAMS });
    rerender({ window: win(30, 31), parameters: PARAMS });
    // Serve whatever the hook asks for until it stops asking.
    for (let i = 0; i < 50; i++) {
      await act(async () => {
        resolveAll();
      });
      if (pending.filter((r) => !r.signal?.aborted).length === 0) break;
    }
    const loaded = result.current.chunks.map((c) => c.chunk.index);
    // Chunks covering 30-31 s are 52 and 53.
    expect(loaded).toEqual(expect.arrayContaining([52, 53]));
  });

  it("retries a chunk that failed with a transient error", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderImages(win(0, 0.5));
    await waitFor(() => expect(pending.length).toBeGreaterThan(0));
    const first = pending.find((r) => r.segment.min === 0)!;
    pending.splice(pending.indexOf(first), 1);
    await act(async () => {
      first.reject(new Error("502 Bad Gateway"));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    await act(async () => {
      resolveAll();
    });
    await waitFor(() =>
      expect(result.current.chunks.map((c) => c.chunk.index)).toContain(0),
    );
  });

  it("does not show images rendered with old parameters after a parameter change", async () => {
    const { result, rerender } = renderImages(win(0, 0.5));
    await waitFor(() => expect(pending.length).toBeGreaterThan(0));
    const oldRequests = [...pending];

    const newParams = { ...PARAMS, gamma: 2 };
    rerender({ window: win(0, 0.5), parameters: newParams });

    // The old request finishes late.
    await act(async () => {
      for (const r of oldRequests) {
        if (r.signal?.aborted) continue;
        pending.splice(pending.indexOf(r), 1);
        r.resolve(new Blob(["old"]));
      }
    });

    for (const c of result.current.chunks) {
      expect(c.image?.src.startsWith("blob:3-")).toBe(false);
    }
  });
});
