import { applyAutoSTFT } from "@/api/spectrograms";
import { clampSamplerate, validateParameters } from "@/hooks/spectrogram/useSpectrogram";
import { getSpectrogramViewportRequests } from "@/hooks/spectrogram/useSpectrogramImages";
import { getOverviewParameters, getOverviewRequests } from "@/hooks/spectrogram/useSpectrogramOverview";
import { getWaveformViewportRequests } from "@/hooks/spectrogram/useWaveformImages";
import type { ImageRequest } from "@/utils/spectrogram_images";
import { getInitialViewingWindow } from "@/utils/windows";

import type { AnnotationTask, Recording, SpectrogramParameters, SpectrogramWindow } from "@/types";

type TaskTimes = Pick<AnnotationTask, "start_time" | "end_time">;

/**
 * How the annotate view opens a task: its parameters (auto STFT applied), the
 * navigable bounds and the initial window.
 */
export function getAnnotateViewWindows(
  task: TaskTimes,
  recordingSamplerate: number,
  parameters: SpectrogramParameters,
): { effectiveParameters: SpectrogramParameters; bounds: SpectrogramWindow; initial: SpectrogramWindow } {
  const effectiveParameters = applyAutoSTFT(parameters, recordingSamplerate);
  const samplerate = clampSamplerate(effectiveParameters, recordingSamplerate);
  return {
    effectiveParameters,
    bounds: {
      time: { min: task.start_time, max: task.end_time },
      freq: { min: 0, max: samplerate / 2 },
    },
    initial: getInitialViewingWindow({
      startTime: task.start_time,
      endTime: task.end_time,
      samplerate,
      parameters: effectiveParameters,
    }),
  };
}

/**
 * The images the annotate view requests when it opens `task` with the saved
 * `parameters`, most needed first: the visible spectrogram chunks, the
 * waveform, the overview bar, then the chunks next to the visible ones. They
 * are the very requests of the view (same cache keys), so prefetching them
 * makes the task show at once.
 */
export function getAnnotateViewImageRequests(
  task: Pick<AnnotationTask, "recording_id" | "start_time" | "end_time"> & { recording: Recording },
  parameters: SpectrogramParameters,
): ImageRequest[] {
  const { recording } = task;
  const { effectiveParameters, bounds, initial } = getAnnotateViewWindows(
    task,
    recording.samplerate,
    parameters,
  );
  // What useSpectrogram holds, and passes to the chunks, waveform and overview
  const viewParameters = validateParameters(effectiveParameters, recording.samplerate);

  const spectrogram = getSpectrogramViewportRequests({
    task,
    window: initial,
    samplerate: clampSamplerate(viewParameters, recording.samplerate),
    parameters: viewParameters,
  });
  const waveform = getWaveformViewportRequests({
    recording,
    window: { time: initial.time },
    parameters: viewParameters,
  });
  const overview = getOverviewRequests({
    recording_id: recording.id,
    segment: bounds,
    parameters: getOverviewParameters(viewParameters),
  });
  return [...spectrogram.visible, ...waveform, ...overview, ...spectrogram.neighbours];
}
