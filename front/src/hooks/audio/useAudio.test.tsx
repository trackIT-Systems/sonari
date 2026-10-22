import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import useAudio from "@/hooks/audio/useAudio";
import type { Recording } from "@/types";

vi.mock("@/app/api", () => ({
  default: {
    audio: {
      getStreamUrl: ({ recording, speed, channel }: { recording: Recording; speed: number; channel?: number | null }) =>
        // Relative, like an API base URL such as "/sonari": the element turns
        // it into an absolute URL (see FakeAudio.src).
        `/audio?recording_id=${recording.id}&speed=${speed}${channel != null ? `&channel=${channel}` : ""}`,
    },
  },
}));

class FakeAudio extends EventTarget {
  private _src = "";
  /** Like a real media element: `src` reads back as an absolute URL. */
  get src() {
    return this._src;
  }
  set src(value: string) {
    this._src = new URL(value, "http://test").href;
  }
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

type Props = { startTime: number; endTime: number; withAutoplay: boolean; channel?: number | null };

function renderAudio(initial: Partial<Props> = {}) {
  return renderHook(
    (props: Props) =>
      useAudio({
        recording,
        startTime: props.startTime,
        endTime: props.endTime,
        channel: props.channel,
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

  it("keeps the position and keeps playing when the speed changes", async () => {
    const { result } = renderAudio();
    await playTo(result, 6);
    // A real element stops playing when a new source is loaded.
    vi.spyOn(element!, "load").mockImplementation(function (this: FakeAudio) {
      this.pause();
    });

    await act(async () => {
      result.current.setSpeed(0.5);
      await vi.advanceTimersByTimeAsync(32);
    });

    expect(element!.src).toContain("speed=0.5");
    // Same place in the recording: 6 s, which is 12 s into the slowed stream.
    expect(element!.currentTime).toBeCloseTo(12);
    expect(result.current.currentTime).toBeCloseTo(6);
    expect(element!.paused).toBe(false);
    expect(result.current.isPlaying).toBe(true);
  });

  it("does not reload the stream when only the segment changes", async () => {
    const { result, rerender } = renderAudio();
    await playTo(result, 6);
    const load = vi.spyOn(element!, "load");

    await act(async () => {
      rerender({ startTime: 3, endTime: 4, withAutoplay: false });
      await vi.advanceTimersByTimeAsync(32);
    });

    expect(load).not.toHaveBeenCalled();
    expect(result.current.currentTime).toBeCloseTo(3);
  });

  it("plays the selected channel and keeps playing when it changes", async () => {
    const { result, rerender } = renderAudio({ channel: null });
    expect(element!.src).not.toContain("channel=");
    await playTo(result, 6);
    vi.spyOn(element!, "load").mockImplementation(function (this: FakeAudio) {
      this.pause();
    });

    await act(async () => {
      rerender({ startTime: 2, endTime: 10, withAutoplay: false, channel: 1 });
      await vi.advanceTimersByTimeAsync(32);
    });

    expect(element!.src).toContain("channel=1");
    expect(element!.currentTime).toBeCloseTo(6);
    expect(element!.paused).toBe(false);
    expect(result.current.isPlaying).toBe(true);
  });
});
