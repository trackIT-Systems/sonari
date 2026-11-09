import { useCallback, useMemo, useRef } from "react";

import { applyAutoSTFT } from "@/api/spectrograms";
import useCanvas from "@/hooks/draw/useCanvas";
import { clampSamplerate } from "@/hooks/spectrogram/useSpectrogram";
import useSpectrogramPreviewImage from "@/hooks/spectrogram/useSpectrogramPreviewImage";
import useStore from "@/store";

import type { ReferenceCall } from "@/api/annotation_projects";
import type { SpectrogramWindow } from "@/types";

export const TILE_WIDTH = 176;
const TILE_HEIGHT = 120;
/** Image size requested from the backend, ~2x the canvas for smooth downscaling */
const TARGET_COLUMNS = 2 * TILE_WIDTH;
const TARGET_ROWS = 2 * TILE_HEIGHT;

const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

/** Time and frequency shown around a call: its box with some context on each side. */
export function callWindow(call: ReferenceCall, nyquist: number): SpectrogramWindow {
  const duration = call.end_time - call.start_time;
  const timePad = Math.max(0.5 * duration, 0.01);
  const band = call.high_freq - call.low_freq;
  const freqPad = Math.max(0.25 * band, 2000);
  return {
    time: {
      min: Math.max(0, call.start_time - timePad),
      max: Math.min(call.recording_duration, call.end_time + timePad),
    },
    freq: {
      min: Math.max(0, call.low_freq - freqPad),
      max: Math.min(nyquist, call.high_freq + freqPad),
    },
  };
}

function fileName(path: string) {
  return path.split("/").pop() ?? path;
}

/**
 * One reference call: a small spectrogram of its box with some context, drawn from the
 * channel where the call is clearest, and its levels. Clicking opens its task.
 */
export default function ReferenceCallTile({
  call,
  rank,
  annotationProjectId,
}: {
  call: ReferenceCall;
  rank: number;
  annotationProjectId: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const savedParameters = useStore((state) => state.spectrogramSettings);

  const parameters = useMemo(() => {
    const auto = applyAutoSTFT(savedParameters, call.samplerate);
    const nyquist = clampSamplerate(auto, call.samplerate) / 2;
    const visible = callWindow(call, nyquist);
    return {
      ...auto,
      channel: call.channel < call.channels ? call.channel : 0,
      mix_channels: false,
      overlap_percent: 99,
      max_columns: TARGET_COLUMNS,
      // Rows for the full range, so the band shown still gets ~TARGET_ROWS
      max_rows: Math.round((TARGET_ROWS * nyquist) / Math.max(1, visible.freq.max - visible.freq.min)),
      lossy: true,
      freqLines: [],
      time_zoom_automatic: true,
      time_zoom_duration_seconds: undefined,
    };
  }, [savedParameters, call]);

  const nyquist = clampSamplerate(parameters, call.samplerate) / 2;
  const visible = useMemo(() => callWindow(call, nyquist), [call, nyquist]);
  // The image covers every frequency; only the call's band is drawn
  const segment = useMemo<SpectrogramWindow>(
    () => ({ time: visible.time, freq: { min: 0, max: nyquist } }),
    [visible.time, nyquist],
  );

  const { image, isError, retry } = useSpectrogramPreviewImage({
    recording_id: call.recording_id,
    segment,
    parameters,
    enabled: true,
  });

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      const { width, height } = ctx.canvas;
      ctx.fillStyle = "rgb(214 211 209)";
      ctx.fillRect(0, 0, width, height);
      if (!image) return;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      // Image row 0 is the Nyquist frequency
      const top = image.height * (1 - visible.freq.max / nyquist);
      const bottom = image.height * (1 - visible.freq.min / nyquist);
      ctx.drawImage(image, 0, top, image.width, bottom - top, 0, 0, width, height);

      const span = visible.time.max - visible.time.min;
      const band = visible.freq.max - visible.freq.min;
      const x0 = ((call.start_time - visible.time.min) / span) * width;
      const x1 = ((call.end_time - visible.time.min) / span) * width;
      const y0 = (1 - (call.high_freq - visible.freq.min) / band) * height;
      const y1 = (1 - (call.low_freq - visible.freq.min) / band) * height;
      ctx.strokeStyle = "rgb(16 185 129)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    },
    [image, visible, nyquist, call],
  );

  useCanvas({ ref: canvasRef as React.RefObject<HTMLCanvasElement>, draw });

  const basePath = process.env.NEXT_PUBLIC_SONARI_FOLDER ?? "";
  const href =
    `${basePath}/annotation_projects/detail/annotation/?annotation_task_id=${call.annotation_task_id}` +
    `&annotation_project_id=${annotationProjectId}`;
  const title = [
    `#${rank} · ${fileName(call.recording_path)}`,
    `${call.start_time.toFixed(3)}–${call.end_time.toFixed(3)} s, ${numberFormat.format(call.low_freq / 1000)}–${numberFormat.format(call.high_freq / 1000)} kHz`,
    call.snr_db != null ? `${call.snr_db.toFixed(1)} dB above the background` : null,
    `Peak ${call.peak_dbfs.toFixed(1)} dBFS${call.clipped ? " (clipped: the real level is higher)" : ""}`,
    call.channels > 1 ? `Channel ${call.channel + 1}` : null,
    "Click to open the task",
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      title={title}
      className="group flex shrink-0 flex-col gap-1 rounded-md p-1 hover:bg-stone-100 dark:hover:bg-stone-800"
      style={{ width: TILE_WIDTH + 8 }}
    >
      <div className="relative">
        <canvas
          ref={canvasRef}
          className="rounded"
          style={{ width: TILE_WIDTH, height: TILE_HEIGHT }}
          width={TILE_WIDTH}
          height={TILE_HEIGHT}
        />
        <span className="absolute left-1 top-1 rounded-sm bg-black/50 px-1 text-[10px] leading-4 text-white">
          #{rank}
        </span>
        {call.clipped && (
          <span className="absolute right-1 top-1 rounded-sm bg-amber-600/90 px-1 text-[10px] leading-4 text-white">
            clipped
          </span>
        )}
        {isError && (
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              retry();
            }}
            className="absolute inset-0 flex items-center justify-center text-xs text-red-600 underline"
          >
            Retry
          </button>
        )}
      </div>
      <div className="flex justify-between text-xs text-stone-700 dark:text-stone-300">
        <span>{call.snr_db != null ? `SNR ${numberFormat.format(call.snr_db)} dB` : "SNR –"}</span>
        <span>{numberFormat.format(call.peak_dbfs)} dBFS</span>
      </div>
      <div className="truncate text-[11px] text-stone-500 dark:text-stone-400">{fileName(call.recording_path)}</div>
    </a>
  );
}
