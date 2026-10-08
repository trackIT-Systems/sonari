import { useCallback, useMemo, useRef } from "react";

import { applyAutoSTFT } from "@/api/spectrograms";
import { SPECTROGRAM_CANVAS_DIMENSIONS } from "@/constants";
import { drawAllFrequencyLines } from "@/draw/freqLines";
import useCanvas from "@/hooks/draw/useCanvas";
import { clampSamplerate } from "@/hooks/spectrogram/useSpectrogram";
import useSpectrogramPreviewImage from "@/hooks/spectrogram/useSpectrogramPreviewImage";
import useStore from "@/store";
import type { AnnotationTask, SpectrogramWindow } from "@/types";

const PREVIEW_HEIGHT = 160;
/** Longer tasks are not previewed: a single image request would get too heavy */
const MAX_PREVIEW_DURATION = 30;
/** Time columns requested from the backend, ~4x the canvas width for smooth downscaling */
const TARGET_COLUMNS = 4000;

const KHZ_STEPS = [1, 2, 5, 10, 20, 25, 50, 100];
/** Aim for a tick roughly every this many pixels of preview height */
const TICK_SPACING_PX = 36;

/** Frequency ticks (kHz) with a "nice" step, excluding 0 and the very top. */
function getFrequencyTicks(maxHz: number): number[] {
  const maxKHz = maxHz / 1000;
  const target = (maxKHz * TICK_SPACING_PX) / PREVIEW_HEIGHT;
  const step = KHZ_STEPS.find((candidate) => candidate >= target) ?? KHZ_STEPS[KHZ_STEPS.length - 1];
  const ticks: number[] = [];
  for (let f = step; f < maxKHz * 0.97; f += step) ticks.push(f);
  return ticks;
}

/**
 * Light frequency scale drawn as an HTML overlay (crisp at any canvas
 * scaling): faint dashed guides with small kHz labels on the left edge.
 */
function FrequencyAxis({ maxHz }: { maxHz: number }) {
  const maxKHz = maxHz / 1000;
  const ticks = useMemo(() => getFrequencyTicks(maxHz), [maxHz]);
  const label = "pointer-events-none absolute left-1 -translate-y-1/2 rounded-sm bg-black/40 px-1 text-[10px] leading-4 tabular-nums text-white/90";

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-md" aria-hidden>
      {ticks.map((f) => {
        const top = `${(1 - f / maxKHz) * 100}%`;
        return (
          <div key={f} className="absolute inset-x-0" style={{ top }}>
            <div className="border-t border-dashed border-white/25" />
            <span className={label}>{f}k</span>
          </div>
        );
      })}
      <span className="absolute left-1 top-1 rounded-sm bg-black/40 px-1 text-[10px] leading-4 text-white/80">
        kHz
      </span>
    </div>
  );
}

/**
 * Small, static spectrogram of a whole task (full time range, no axes,
 * no sound events), loaded as a single image. Only requested while mounted.
 * It is rendered with the user's saved spectrogram parameters, and their
 * frequency lines are drawn on top.
 */
export default function AnnotationTaskSpectrogramPreview({
  task,
  pinned = false,
  deferred = false,
  onTogglePin,
}: {
  task: AnnotationTask;
  /** Pinned previews stay open while the cursor moves on */
  pinned?: boolean;
  /** Show the empty frame without requesting the image yet */
  deferred?: boolean;
  onTogglePin?: () => void;
}) {
  const recording = task.recording;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const duration = task.end_time - task.start_time;
  const tooLong = duration > MAX_PREVIEW_DURATION;

  const savedParameters = useStore((state) => state.spectrogramSettings);

  const parameters = useMemo(() => {
    if (!recording) return savedParameters;
    const auto = applyAutoSTFT(savedParameters, recording.samplerate);
    // Auto STFT overlap is tuned for panning (hundreds of thousands of columns);
    // for a preview only ~TARGET_COLUMNS are needed. Backend accepts 1-99%.
    const samples = duration * clampSamplerate(auto, recording.samplerate);
    const windowSize = auto.window_size_samples;
    const overlap = 100 * (1 - samples / (TARGET_COLUMNS * windowSize));
    return {
      ...auto,
      // The saved channel may not exist on this recording
      channel: auto.channel < recording.channels ? auto.channel : 0,
      overlap_percent: Math.min(99, Math.max(1, Math.round(overlap))),
    };
  }, [recording, duration, savedParameters]);

  // Frequency lines and the time zoom do not change the image, so they stay out
  // of the request: they would otherwise be part of the cache key and toggling
  // a line would download an identical spectrogram again.
  const imageParameters = useMemo(
    () => ({
      ...parameters,
      freqLines: [],
      time_zoom_automatic: true,
      time_zoom_duration_seconds: undefined,
    }),
    [parameters],
  );

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
    parameters: imageParameters,
    enabled: recording != null && !tooLong && !deferred,
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
      drawAllFrequencyLines(ctx, parameters.freqLines, segment);
    },
    [image, parameters.freqLines, segment],
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
      <div className="relative">
        <canvas
          ref={canvasRef}
          className="w-full rounded-md"
          style={{ height: PREVIEW_HEIGHT }}
          width={SPECTROGRAM_CANVAS_DIMENSIONS.width}
          height={PREVIEW_HEIGHT}
        />
        <FrequencyAxis maxHz={samplerate / 2} />
        {onTogglePin && (
          <button
            type="button"
            // Don't take focus: a focused button blocks the table's shortcuts
            onMouseDown={(event) => event.preventDefault()}
            onClick={onTogglePin}
            title={pinned ? "Unpin preview (p)" : "Keep this preview open while moving on (p)"}
            className={`absolute right-1 top-1 rounded-sm px-1.5 text-[10px] leading-4 text-white backdrop-blur-sm ${
              pinned
                ? "bg-emerald-600/80 hover:bg-emerald-600"
                : "bg-black/40 text-white/90 hover:bg-black/60"
            }`}
          >
            {pinned ? "Pinned" : "Pin"} <span className="font-mono">p</span>
          </button>
        )}
      </div>
      {isError && (
        <p className="pt-1 text-sm text-red-500">Failed to load preview.</p>
      )}
    </div>
  );
}
