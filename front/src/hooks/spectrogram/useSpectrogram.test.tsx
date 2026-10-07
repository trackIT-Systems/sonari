import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_SPECTROGRAM_PARAMETERS } from "@/api/spectrograms";
import useSpectrogram from "@/hooks/spectrogram/useSpectrogram";
import type {
  AnnotationTask,
  SpectrogramParameters,
  SpectrogramWindow,
} from "@/types";

vi.mock("@/hooks/spectrogram/useSpectrogramImages", () => ({
  default: () => ({ chunks: [], isLoading: false, isError: false }),
}));

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
  recording: { channels: 1 },
} as AnnotationTask;

function win(
  min: number,
  max: number,
  freqMax = SAMPLERATE / 2,
): SpectrogramWindow {
  return { time: { min, max }, freq: { min: 0, max: freqMax } };
}

type Props = {
  bounds: SpectrogramWindow;
  initial: SpectrogramWindow;
  parameters: SpectrogramParameters;
};

function renderSpectrogram() {
  return renderHook(
    (props: Props) =>
      useSpectrogram({
        task,
        samplerate: SAMPLERATE,
        bounds: props.bounds,
        initial: props.initial,
        parameters: props.parameters,
        withSpectrogram: true,
        fixedAspectRatio: false,
        toggleFixedAspectRatio: () => undefined,
        onSegmentsLoaded: () => undefined,
        withShortcuts: false,
      }),
    {
      initialProps: {
        bounds: win(0, 60),
        initial: win(0, 1),
        parameters: PARAMS,
      },
    },
  );
}

describe("useSpectrogram window", () => {
  it("keeps the user's zoom when the parent recreates equal bounds/initial/parameters", () => {
    const { result, rerender } = renderSpectrogram();
    act(() => result.current.zoom(win(10, 10.25, 40000)));
    expect(result.current.window).toEqual(win(10, 10.25, 40000));

    // Simulates the task query being replaced (e.g. after adding a tag or
    // badge): every memo in AnnotationTaskSpectrogram recomputes to an
    // equal-but-new object.
    rerender({
      bounds: win(0, 60),
      initial: win(0, 1),
      parameters: { ...PARAMS },
    });

    expect(result.current.window).toEqual(win(10, 10.25, 40000));
  });

  it("keeps the frequency zoom when only the bounds identity changes", () => {
    const { result, rerender } = renderSpectrogram();
    const initial = win(0, 1);
    rerender({ bounds: win(0, 60), initial, parameters: PARAMS });
    act(() => result.current.zoom(win(0, 1, 30000)));
    rerender({ bounds: win(0, 60), initial, parameters: PARAMS });
    expect(result.current.window.freq).toEqual({ min: 0, max: 30000 });
  });

  it("still resets to the new initial window when it really changes", () => {
    const { result, rerender } = renderSpectrogram();
    act(() => result.current.zoom(win(10, 10.25)));
    rerender({ bounds: win(0, 60), initial: win(0, 2), parameters: PARAMS });
    expect(result.current.window).toEqual(win(0, 2));
  });
});
