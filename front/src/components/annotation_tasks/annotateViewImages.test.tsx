import { act, cleanup, renderHook } from "@testing-library/react";
import { useMemo } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_SPECTROGRAM_PARAMETERS } from "@/api/spectrograms";
import {
  getAnnotateViewImageRequests,
  getAnnotateViewWindows,
} from "@/components/annotation_tasks/annotateViewImages";
import useSpectrogram from "@/hooks/spectrogram/useSpectrogram";
import useSpectrogramOverview, { getOverviewParameters } from "@/hooks/spectrogram/useSpectrogramOverview";
import useWaveform from "@/hooks/spectrogram/useWaveform";
import { spectrogramCache } from "@/utils/spectrogram_cache";
import type { ImageRequest } from "@/utils/spectrogram_images";
import type { AnnotationTask, Recording, SpectrogramParameters } from "@/types";

type Call = {
  kind: "spectrogram" | "waveform";
  recording_id: number;
  segment: { min: number; max: number };
  parameters: SpectrogramParameters;
  resolve: (blob: Blob) => void;
};

const calls: Call[] = [];

vi.mock("@/app/api", () => {
  const request = (kind: Call["kind"]) =>
    (args: {
      recording_id?: number;
      recording?: { id: number };
      segment: { min: number; max: number };
      parameters: SpectrogramParameters;
    }) =>
      new Promise<Blob>((resolve) => {
        calls.push({
          kind,
          recording_id: args.recording_id ?? args.recording!.id,
          segment: args.segment,
          parameters: args.parameters,
          resolve,
        });
      });
  return {
    default: {
      spectrograms: { getBlob: request("spectrogram") },
      waveforms: { getBlob: request("waveform") },
    },
  };
});

class FakeImage {
  onload: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  width = 10;
  height = 10;
  complete = true;
  set src(_value: string) {
    queueMicrotask(() => this.onload?.());
  }
  decode() {
    return Promise.resolve();
  }
}

beforeEach(() => {
  calls.length = 0;
  spectrogramCache.clear();
  vi.stubGlobal("Image", FakeImage);
  vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:x", revokeObjectURL: () => undefined });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const recording = {
  id: 7,
  path: "rec.wav",
  duration: 30,
  samplerate: 384000,
  channels: 2,
} as Recording;

/** A task that does not start at 0, on a long recording */
const task = {
  id: 1,
  recording_id: 7,
  start_time: 2,
  end_time: 12,
  recording,
} as AnnotationTask & { recording: Recording };

const saved: SpectrogramParameters = { ...DEFAULT_SPECTROGRAM_PARAMETERS, auto_stft: true };

const keyOf = (kind: string, recordingId: number, min: number, max: number, parameters: SpectrogramParameters) =>
  `${kind}|${recordingId}|${min}|${max}|${JSON.stringify(parameters)}`;

const requestKey = (r: ImageRequest) =>
  keyOf(
    r.kind,
    r.kind === "spectrogram" ? r.recording_id : r.recording.id,
    r.segment.time.min,
    r.segment.time.max,
    r.parameters,
  );

/** Opens the task as AnnotationTaskSpectrogram does and serves every request until none is left */
async function requestsOfTheView(): Promise<Set<string>> {
  const { effectiveParameters, bounds, initial } = getAnnotateViewWindows(task, recording.samplerate, saved);
  renderHook(() => {
    const spectrogram = useSpectrogram({
      task,
      samplerate: recording.samplerate,
      bounds,
      initial,
      parameters: effectiveParameters,
      withSpectrogram: true,
      fixedAspectRatio: false,
      toggleFixedAspectRatio: () => undefined,
      onSegmentsLoaded: () => undefined,
      withShortcuts: false,
    });
    useWaveform({
      recording,
      parameters: spectrogram.parameters,
      window: spectrogram.window,
      withSpectrogram: true,
    });
    // Memoized like SpectrogramBar does
    const overviewParameters = useMemo(
      () => getOverviewParameters(spectrogram.parameters),
      [spectrogram.parameters],
    );
    useSpectrogramOverview({
      recording_id: recording.id,
      segment: bounds,
      parameters: overviewParameters,
      withSpectrogram: true,
    });
  });

  const seen = new Set<string>();
  for (let served = 0; served < 100; ) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const open = calls.splice(0);
    if (open.length === 0) break;
    for (const call of open) {
      seen.add(keyOf(call.kind, call.recording_id, call.segment.min, call.segment.max, call.parameters));
      call.resolve(new Blob(["x"]));
      served += 1;
    }
  }
  return seen;
}

describe("getAnnotateViewImageRequests", () => {
  it("prefetches exactly the images the annotate view requests when it opens the task", async () => {
    const prefetched = getAnnotateViewImageRequests(task, saved);
    const requested = await requestsOfTheView();

    expect(prefetched.length).toBeGreaterThan(0);
    expect(new Set(prefetched.map(requestKey))).toEqual(requested);
  });

  it("puts the visible spectrogram chunks first and covers waveform and overview", () => {
    const prefetched = getAnnotateViewImageRequests(task, saved);
    const { initial } = getAnnotateViewWindows(task, recording.samplerate, saved);
    expect(prefetched[0].kind).toBe("spectrogram");
    // The first one overlaps the initial window
    expect(prefetched[0].segment.time.min).toBeLessThan(initial.time.max);
    expect(prefetched.some((r) => r.kind === "waveform")).toBe(true);
    // The overview covers the whole task
    expect(
      prefetched.some((r) => r.segment.time.min === task.start_time && r.segment.time.max === task.end_time),
    ).toBe(true);
  });
});
