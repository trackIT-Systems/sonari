import { describe, expect, it } from "vitest";

import { callWindow } from "@/components/reference_calls/ReferenceCallTile";

import type { ReferenceCall } from "@/api/annotation_projects";

function call(overrides: Partial<ReferenceCall> = {}): ReferenceCall {
  return {
    sound_event_annotation_id: 1,
    annotation_task_id: 1,
    recording_id: 1,
    recording_path: "a/b.flac",
    samplerate: 384_000,
    channels: 2,
    time_expansion: 1,
    recording_duration: 3.5,
    start_time: 1.0,
    end_time: 1.006,
    low_freq: 35_000,
    high_freq: 70_000,
    peak_dbfs: -20,
    rms_dbfs: -25,
    snr_db: 30,
    clipped: false,
    channel: 1,
    ...overrides,
  };
}

describe("callWindow", () => {
  it("adds at least 10 ms and a quarter of the band around a short bat call", () => {
    const w = callWindow(call(), 192_000);
    expect(w.time.min).toBeCloseTo(0.99);
    expect(w.time.max).toBeCloseTo(1.016);
    expect(w.freq.min).toBeCloseTo(26_250);
    expect(w.freq.max).toBeCloseTo(78_750);
  });

  it("stays inside the recording and below the Nyquist frequency", () => {
    const w = callWindow(call({ start_time: 0.001, end_time: 3.499, high_freq: 190_000 }), 192_000);
    expect(w.time.min).toBe(0);
    expect(w.time.max).toBe(3.5);
    expect(w.freq.max).toBe(192_000);
  });
});
