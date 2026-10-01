import { useCallback, useMemo, useRef } from "react";

import { DEFAULT_SPECTROGRAM_PARAMETERS, applyAutoSTFT } from "@/api/spectrograms";
import { SPECTROGRAM_CANVAS_DIMENSIONS } from "@/constants";
import useCanvas from "@/hooks/draw/useCanvas";
import { clampSamplerate } from "@/hooks/spectrogram/useSpectrogram";
import useSpectrogramPreviewImage from "@/hooks/spectrogram/useSpectrogramPreviewImage";
import type { AnnotationTask, SpectrogramWindow } from "@/types";

const PREVIEW_HEIGHT = 160;
/** Longer tasks are not previewed: a single image request would get too heavy */
const MAX_PREVIEW_DURATION = 30;
/** Time columns requested from the backend, ~4x the canvas width for smooth downscaling */
const TARGET_COLUMNS = 4000;

/**
 * Small, static spectrogram of a whole task (full time range, no axes,
 * no sound events), loaded as a single image. Only requested while mounted.
 */
export default function AnnotationTaskSpectrogramPreview({
  task,
}: {
  task: AnnotationTask;
}) {
  const recording = task.recording;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const duration = task.end_time - task.start_time;
  const tooLong = duration > MAX_PREVIEW_DURATION;

  const parameters = useMemo(() => {
    if (!recording) return DEFAULT_SPECTROGRAM_PARAMETERS;
    const auto = applyAutoSTFT(
      {
        ...DEFAULT_SPECTROGRAM_PARAMETERS,
        mix_channels: recording.channels > 1,
      },
      recording.samplerate,
    );
    // Auto STFT overlap is tuned for panning (hundreds of thousands of columns);
    // for a preview only ~TARGET_COLUMNS are needed. Backend accepts 1-99%.
    const samples = duration * clampSamplerate(auto, recording.samplerate);
    const windowSize = auto.window_size_samples;
    const overlap = 100 * (1 - samples / (TARGET_COLUMNS * windowSize));
    return {
      ...auto,
      overlap_percent: Math.min(99, Math.max(1, Math.round(overlap))),
    };
  }, [recording, duration]);

  const samplerate = clampSamplerate(parameters, recording?.samplerate ?? 0);

  const segment = useMemo<SpectrogramWindow>(
    () => ({
      time: { min: task.start_time, max: task.end_time },
      freq: { min: 0, max: samplerate / 2 },
    }),
    [task.start_time, task.end_time, samplerate],
  );

  const { image, isError } = useSpectrogramPreviewImage({
    recording_id: task.recording_id,
    segment,
    parameters,
    enabled: recording != null && !tooLong,
  });

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      const { width, height } = ctx.canvas;
      ctx.fillStyle = "rgb(214 211 209)";
      ctx.fillRect(0, 0, width, height);
      if (!image) return;
      // useCanvas disables smoothing; downscaling a large image needs it
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(image, 0, 0, width, height);
    },
    [image],
  );

  useCanvas({ ref: canvasRef as React.RefObject<HTMLCanvasElement>, draw });

  if (!recording) return null;

  if (tooLong) {
    return (
      <p className="p-2 text-sm text-stone-500">
        Preview unavailable for tasks longer than {MAX_PREVIEW_DURATION} s.
      </p>
    );
  }

  return (
    <div className="p-2">
      <canvas
        ref={canvasRef}
        className="w-full rounded-md"
        style={{ height: PREVIEW_HEIGHT }}
        width={SPECTROGRAM_CANVAS_DIMENSIONS.width}
        height={PREVIEW_HEIGHT}
      />
      {isError && (
        <p className="pt-1 text-sm text-red-500">Failed to load preview.</p>
      )}
    </div>
  );
}
