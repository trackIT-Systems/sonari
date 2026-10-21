import { useCallback, useMemo, useRef } from "react";

import { applyAutoSTFT } from "@/api/spectrograms";
import { SPECTROGRAM_CANVAS_DIMENSIONS } from "@/constants";
import { drawAllFrequencyLines } from "@/draw/freqLines";
import useCanvas from "@/hooks/draw/useCanvas";
import { clampSamplerate } from "@/hooks/spectrogram/useSpectrogram";
import useSpectrogramPreviewImage from "@/hooks/spectrogram/useSpectrogramPreviewImage";
import useStore from "@/store";
import type { AnnotationTask, SpectrogramWindow } from "@/types";
import { PREVIEW_CHANNEL_SHORTCUT } from "@/utils/keyboard";

const PREVIEW_HEIGHT = 160;
/** Longer tasks are not previewed: a single image request would get too heavy */
const MAX_PREVIEW_DURATION = 30;
/** Image size requested from the backend, ~2x the canvas for smooth downscaling */
const TARGET_COLUMNS = 2000;
const TARGET_ROWS = 2 * PREVIEW_HEIGHT;
/** Calls sit below this: higher frequencies are cut off to give them more room */
export const PREVIEW_MAX_FREQ = 150_000;
/** Always one of the frequency guides of the preview */
export const PREVIEW_REFERENCE_FREQ = 40_000;

const KHZ_STEPS = [1, 2, 5, 10, 20, 25, 50, 100];
/** Aim for a tick roughly every this many pixels of preview height */
const TICK_SPACING_PX = 36;

/**
 * Frequency ticks (kHz) with a "nice" step, excluding 0 and the very top, plus
 * the reference frequency. Ticks within half a step of the reference are left
 * out so they don't crowd it (e.g. 40k replaces 50k on a 0-150 kHz scale).
 */
export function getFrequencyTicks(maxHz: number): number[] {
  const maxKHz = maxHz / 1000;
  const referenceKHz = PREVIEW_REFERENCE_FREQ / 1000;
  const target = (maxKHz * TICK_SPACING_PX) / PREVIEW_HEIGHT;
  const step = KHZ_STEPS.find((candidate) => candidate >= target) ?? KHZ_STEPS[KHZ_STEPS.length - 1];
  const ticks: number[] = [];
  for (let f = step; f < maxKHz * 0.97; f += step) {
    if (Math.abs(f - referenceKHz) >= step / 2) ticks.push(f);
  }
  if (referenceKHz < maxKHz * 0.97) ticks.push(referenceKHz);
  return ticks.sort((a, b) => a - b);
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

/** A single channel, or all channels mixed to mono */
export type PreviewChannel = number | "mix";

/**
 * The channel after `shown` when cycling: each channel in turn, then all
 * mixed, then the first again (the order of the annotate view's channel cycle).
 */
export function nextPreviewChannel(shown: PreviewChannel, channels: number): PreviewChannel {
  if (shown === "mix") return 0;
  const channel = shown < channels ? shown : 0;
  return channel + 1 < channels ? channel + 1 : "mix";
}

/** One button per channel and one for all mixed; the choice applies to all previews of the table. */
function ChannelSwitcher({
  channels,
  active,
  onChange,
}: {
  channels: number;
  active: PreviewChannel;
  onChange: (channel: PreviewChannel) => void;
}) {
  const options: { value: PreviewChannel; label: string; title?: string }[] = [
    ...Array.from({ length: channels }, (_, channel) => ({ value: channel, label: `Ch ${channel + 1}` })),
    { value: "mix", label: "Mix", title: "All channels mixed to mono" },
  ];

  return (
    <div
      role="group"
      aria-label="Channel"
      title={`Channel shown in the previews (${PREVIEW_CHANNEL_SHORTCUT} cycles)`}
      className="flex overflow-hidden rounded-sm text-[10px] leading-4 text-white backdrop-blur-sm"
    >
      {options.map(({ value, label, title }) => (
        <button
          key={value}
          type="button"
          title={title}
          aria-pressed={value === active}
          // Don't take focus: a focused button blocks the table's shortcuts
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onChange(value)}
          className={`px-1.5 ${
            value === active
              ? "bg-emerald-600/80 hover:bg-emerald-600"
              : "bg-black/40 text-white/90 hover:bg-black/60"
          }`}
        >
          {label}
        </button>
      ))}
      <span className="bg-black/40 px-1 font-mono text-white/90">{PREVIEW_CHANNEL_SHORTCUT}</span>
    </div>
  );
}

/**
 * Small, static spectrogram of a whole task (full time range, no axes,
 * no sound events), loaded as a single image. Only requested while mounted.
 * It is rendered with the user's saved spectrogram parameters, and their
 * frequency lines are drawn on top; 40 kHz is always one of the guides. Frequencies
 * above 150 kHz are cut off. The channel can be switched here without
 * changing the saved parameters.
 */
export default function AnnotationTaskSpectrogramPreview({
  task,
  pinned = false,
  deferred = false,
  onTogglePin,
  channel: selectedChannel = null,
  onChannelChange,
}: {
  task: AnnotationTask;
  /** Pinned previews stay open while the cursor moves on */
  pinned?: boolean;
  /** Show the empty frame without requesting the image yet */
  deferred?: boolean;
  onTogglePin?: () => void;
  /** Channel to show instead of the saved one (null: the saved channel) */
  channel?: PreviewChannel | null;
  onChannelChange?: (channel: PreviewChannel) => void;
}) {
  const recording = task.recording;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const duration = task.end_time - task.start_time;
  const tooLong = duration > MAX_PREVIEW_DURATION;

  const savedParameters = useStore((state) => state.spectrogramSettings);

  const parameters = useMemo(() => {
    if (!recording) return savedParameters;
    const auto = applyAutoSTFT(savedParameters, recording.samplerate);
    const channel = typeof selectedChannel === "number" ? selectedChannel : auto.channel;
    const nyquist = clampSamplerate(auto, recording.samplerate) / 2;
    // Auto STFT overlap is tuned for panning (hundreds of thousands of columns);
    // for a preview only ~TARGET_COLUMNS are needed. Short tasks get the finest
    // hop (99% overlap); for longer ones the backend widens the hop, even past
    // the window size, so it never computes more than TARGET_COLUMNS frames.
    return {
      ...auto,
      // The chosen channel may not exist on this recording
      channel: channel < recording.channels ? channel : 0,
      mix_channels: selectedChannel == null ? auto.mix_channels : selectedChannel === "mix",
      overlap_percent: 99,
      max_columns: TARGET_COLUMNS,
      // Rows for the full range, so the part shown (up to PREVIEW_MAX_FREQ) still
      // gets ~TARGET_ROWS
      max_rows: Math.round((TARGET_ROWS * nyquist) / Math.min(nyquist, PREVIEW_MAX_FREQ)),
      lossy: true,
    };
  }, [recording, savedParameters, selectedChannel]);

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

  // The image covers up to the Nyquist frequency; the preview shows up to maxFreq
  const segment = useMemo<SpectrogramWindow>(
    () => ({
      time: { min: task.start_time, max: task.end_time },
      freq: { min: 0, max: samplerate / 2 },
    }),
    [task.start_time, task.end_time, samplerate],
  );
  const maxFreq = Math.min(samplerate / 2, PREVIEW_MAX_FREQ);
  const visible = useMemo<SpectrogramWindow>(
    () => ({ time: segment.time, freq: { min: 0, max: maxFreq } }),
    [segment.time, maxFreq],
  );

  const { image, isError, retry } = useSpectrogramPreviewImage({
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
      // Only the part up to maxFreq; image row 0 is the Nyquist frequency
      const top = image.height * (1 - visible.freq.max / segment.freq.max);
      ctx.drawImage(image, 0, top, image.width, image.height - top, 0, 0, width, height);
      drawAllFrequencyLines(ctx, parameters.freqLines, visible);
    },
    [image, parameters.freqLines, segment, visible],
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
        <FrequencyAxis maxHz={maxFreq} />
        <div className="absolute right-1 top-1 flex items-center gap-1">
          {onChannelChange && recording.channels > 1 && (
            <ChannelSwitcher
              channels={recording.channels}
              active={parameters.mix_channels ? "mix" : parameters.channel}
              onChange={onChannelChange}
            />
          )}
          {onTogglePin && (
            <button
              type="button"
              // Don't take focus: a focused button blocks the table's shortcuts
              onMouseDown={(event) => event.preventDefault()}
              onClick={onTogglePin}
              title={pinned ? "Unpin preview (p)" : "Keep this preview open while moving on (p)"}
              className={`rounded-sm px-1.5 text-[10px] leading-4 text-white backdrop-blur-sm ${
                pinned
                  ? "bg-emerald-600/80 hover:bg-emerald-600"
                  : "bg-black/40 text-white/90 hover:bg-black/60"
              }`}
            >
              {pinned ? "Pinned" : "Pin"} <span className="font-mono">p</span>
            </button>
          )}
        </div>
      </div>
      {isError && (
        <p className="pt-1 text-sm text-red-500">
          Failed to load preview.{" "}
          <button
            type="button"
            // Don't take focus: a focused button blocks the table's shortcuts
            onMouseDown={(event) => event.preventDefault()}
            onClick={retry}
            className="underline"
          >
            Retry
          </button>
        </p>
      )}
    </div>
  );
}
