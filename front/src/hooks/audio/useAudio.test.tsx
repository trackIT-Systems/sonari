import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import useAudio from "@/hooks/audio/useAudio";
import type { Recording } from "@/types";

vi.mock("@/app/api", () => ({
  default: {
    audio: {
      getStreamUrl: ({ recording, speed }: { recording: Recording; speed: number }) =>
        `http://test/audio?recording_id=${recording.id}&speed=${speed}`,
    },
  },
}));

class FakeAudio extends EventTarget {
  src = "";
  preload = "";
  loop = false;
  volume = 1;
  playbackRate = 1;
  paused = true;
  ended = false;
  currentTime = 0;
  load() {}
  play() {
    this.paused = false;
    this.ended = false;
    this.dispatchEvent(new Event("play"));
    return Promise.resolve();
  }
  pause() {
    if (this.paused) return;
    this.paused = true;
    this.dispatchEvent(new Event("pause"));
  }
  /** Simulate the media element reaching the end of the file. */
  finish(at: number) {
    this.currentTime = at;
    this.paused = true;
    this.ended = true;
    this.dispatchEvent(new Event("pause"));
    this.dispatchEvent(new Event("ended"));
  }
}

let element: FakeAudio | null;
let audioConstructions = 0;

beforeEach(() => {
  element = null;
  audioConstructions = 0;
  vi.useFakeTimers();
  vi.stubGlobal(
    "Audio",
    vi.fn(function () {
      audioConstructions += 1;
      const created = new FakeAudio();
      // The hook must keep using the first element it created.
      element ??= created;
      return created;
    }),
  );
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
    setTimeout(() => cb(performance.now()), 16) as unknown as number,
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const recording = { id: 1, samplerate: 48000, duration: 20 } as Recording;

type Props = { startTime: number; endTime: number; withAutoplay: boolean };

function renderAudio(initial: Partial<Props> = {}) {
  return renderHook(
    (props: Props) =>
      useAudio({
        recording,
        startTime: props.startTime,
        endTime: props.endTime,
        withShortcuts: false,
        withAutoplay: props.withAutoplay,
        onWithAutoplayChange: () => undefined,
      }),
    {
      initialProps: {
        startTime: 2,
        endTime: 10,
        withAutoplay: false,
        ...initial,
      },
    },
  );
}

async function playTo(result: ReturnType<typeof renderAudio>["result"], t: number) {
  await act(async () => {
    result.current.play();
  });
  await act(async () => {
    element!.currentTime = t;
    await vi.advanceTimersByTimeAsync(32);
  });
}

describe("useAudio", () => {
  it("does not jump back to the start when loop is toggled during playback", async () => {
    const { result } = renderAudio();
    await playTo(result, 6);
    expect(result.current.currentTime).toBeCloseTo(6);

    await act(async () => {
      result.current.toggleLoop();
      await vi.advanceTimersByTimeAsync(32);
    });

    expect(element!.currentTime).toBeCloseTo(6);
    expect(result.current.currentTime).toBeCloseTo(6);
    expect(result.current.isPlaying).toBe(true);
  });

  it("creates a single audio element across re-renders", async () => {
    const { result } = renderAudio();
    await playTo(result, 6);
    await act(async () => {
      element!.currentTime = 7;
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(audioConstructions).toBe(1);
  });

  it("does not jump back to the start when the volume changes during playback", async () => {
    const { result } = renderAudio();
    await playTo(result, 6);

    await act(async () => {
      result.current.setVolume(0.5);
      await vi.advanceTimersByTimeAsync(32);
    });

    expect(element!.currentTime).toBeCloseTo(6);
    expect(result.current.currentTime).toBeCloseTo(6);
  });

  it("does not restart playback when autoplay is toggled", async () => {
    const { result, rerender } = renderAudio();
    await playTo(result, 6);

    rerender({ startTime: 2, endTime: 10, withAutoplay: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(32);
    });

    expect(element!.currentTime).toBeCloseTo(6);
  });

  it("moves the playhead all the way to the segment end when playback reaches it", async () => {
    const { result } = renderAudio();
    await playTo(result, 9.99);
    await act(async () => {
      element!.currentTime = 10.004;
      await vi.advanceTimersByTimeAsync(32);
    });

    expect(result.current.isPlaying).toBe(false);
    expect(result.current.currentTime).toBe(10);
  });

  it("moves the playhead to the end when the file ends slightly before the task end", async () => {
    // Task end (20.0) is a few ms past the last sample of the file.
    const { result } = renderAudio({ startTime: 0, endTime: 20 });
    await playTo(result, 19.98);

    await act(async () => {
      element!.finish(19.995);
      await vi.advanceTimersByTimeAsync(32);
    });

    expect(result.current.isPlaying).toBe(false);
    expect(result.current.currentTime).toBe(20);
  });

  it("restarts from the segment start when play is pressed after reaching the end", async () => {
    const { result } = renderAudio();
    await playTo(result, 10.01);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(32);
    });
    expect(result.current.isPlaying).toBe(false);

    await act(async () => {
      result.current.play();
    });
    expect(element!.currentTime).toBeCloseTo(2);
  });

  it("loops back to the segment start when loop is enabled", async () => {
    const { result } = renderAudio();
    await act(async () => {
      result.current.toggleLoop();
    });
    await playTo(result, 10.01);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(32);
    });

    expect(result.current.isPlaying).toBe(true);
    expect(element!.paused).toBe(false);
    expect(element!.currentTime).toBeCloseTo(2);
  });
});
