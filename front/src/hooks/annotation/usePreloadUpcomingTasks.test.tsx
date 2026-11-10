import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_SPECTROGRAM_PARAMETERS } from "@/api/spectrograms";
import { getAnnotateViewImageRequests } from "@/components/annotation_tasks/annotateViewImages";
import usePreloadUpcomingTasks from "@/hooks/annotation/usePreloadUpcomingTasks";
import { spectrogramCache } from "@/utils/spectrogram_cache";
import type { AnnotationTask, Recording } from "@/types";

type Call = { recording_id: number; segment: { min: number; max: number }; resolve: (b: Blob) => void };
const calls: Call[] = [];
/** When false, image requests stay pending until resolved by the test */
let answerAtOnce = true;

const recordingOf = (id: number) =>
  ({ id, path: `r${id}.wav`, duration: 5, samplerate: 384000, channels: 1 }) as Recording;
/** Task n is on recording 100 + n */
const taskOf = (id: number) =>
  ({ id, recording_id: 100 + id, start_time: 0, end_time: 1, recording: recordingOf(100 + id) }) as AnnotationTask;

const getTask = vi.fn(async (id: number) => taskOf(id));

vi.mock("@/app/api", () => {
  const getBlob = (args: { recording_id?: number; recording?: { id: number }; segment: Call["segment"] }) =>
    new Promise<Blob>((resolve) => {
      calls.push({ recording_id: args.recording_id ?? args.recording!.id, segment: args.segment, resolve });
      if (answerAtOnce) resolve(new Blob(["x"]));
    });
  return {
    default: {
      annotationTasks: { get: (id: number) => getTask(id) },
      spectrograms: { getBlob },
      waveforms: { getBlob },
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

const parameters = { ...DEFAULT_SPECTROGRAM_PARAMETERS, auto_stft: true };

function renderPreload(initial: { currentTaskId: number; upcomingTaskIds: number[] }) {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(
    (props: { currentTaskId: number; upcomingTaskIds: number[] }) =>
      usePreloadUpcomingTasks({ ...props, parameters, enabled: true }),
    { initialProps: initial, wrapper },
  );
}

const settle = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));

beforeEach(() => {
  calls.length = 0;
  answerAtOnce = true;
  getTask.mockClear();
  spectrogramCache.clear();
  vi.stubGlobal("Image", FakeImage);
  vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:x", revokeObjectURL: () => undefined });
});

afterEach(async () => {
  cleanup();
  for (const call of calls.splice(0)) call.resolve(new Blob(["x"]));
  await new Promise((r) => setTimeout(r, 0));
  vi.unstubAllGlobals();
});

describe("usePreloadUpcomingTasks", () => {
  it("waits until the current task has loaded", async () => {
    renderPreload({ currentTaskId: 1, upcomingTaskIds: [2, 3] });
    await settle();
    expect(getTask).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it("then loads every image the next tasks open with, the next task first", async () => {
    const { result } = renderPreload({ currentTaskId: 1, upcomingTaskIds: [2, 3] });
    act(() => result.current());

    const expected = [2, 3].map((id) => getAnnotateViewImageRequests(
      { ...taskOf(id), recording: taskOf(id).recording! },
      parameters,
    ));
    const total = expected[0].length + expected[1].length;
    await waitFor(() => expect(calls).toHaveLength(total));

    // All of task 2's images come before task 3's
    expect(calls.slice(0, expected[0].length).every((c) => c.recording_id === 102)).toBe(true);
    expect(calls.slice(expected[0].length).every((c) => c.recording_id === 103)).toBe(true);
    // And they are the view's requests (same time ranges)
    expect(calls.slice(0, expected[0].length).map((c) => c.segment.min)).toEqual(
      expected[0].map((r) => r.segment.time.min),
    );
  });

  it("drops the waiting images when the current task changes", async () => {
    answerAtOnce = false;
    const { result, rerender } = renderPreload({ currentTaskId: 1, upcomingTaskIds: [2, 3] });
    act(() => result.current());
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    const started = calls.length;

    // Moving on: nothing new starts once the running requests finish
    rerender({ currentTaskId: 2, upcomingTaskIds: [3, 4] });
    for (const call of calls) call.resolve(new Blob(["x"]));
    await settle();
    await settle();
    expect(calls).toHaveLength(started);
  });
});
