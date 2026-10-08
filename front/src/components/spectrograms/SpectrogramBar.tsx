import { useCallback, useMemo, useRef, useState } from "react";
import { useMeasure } from "react-use";
import useCanvas from "@/hooks/draw/useCanvas";
import useWindowDrag from "@/hooks/window/useWindowDrag";
import { getWindowPosition } from "@/utils/windows";

import type { SpectrogramWindow, SpectrogramParameters } from "@/types";
import useSpectrogramOverview from "@/hooks/spectrogram/useSpectrogramOverview";

export default function SpectrogramBar({
  recordingId,
  bounds,
  window,
  onMove,
  samplerate,
  parameters,
  withSpectrogram,
}: {
  recordingId: number;
  bounds: SpectrogramWindow;
  window: SpectrogramWindow;
  samplerate: number;
  parameters: SpectrogramParameters;
  withSpectrogram: boolean;
  onMove?: (window: SpectrogramWindow) => void;
}) {
  const [measureRef, barBounds] = useMeasure<HTMLDivElement>();
  const barElementRef = useRef<HTMLDivElement>(null);
  const setBarRef = useCallback(
    (node: HTMLDivElement | null) => {
      barElementRef.current = node;
      measureRef(node);
    },
    [measureRef],
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const width = Math.floor(barBounds.width);
  const height = Math.floor(barBounds.height);

  const barPosition = useMemo(
    () =>
      getWindowPosition({
        width,
        height,
        window,
        bounds,
      }),
    [window, bounds, width, height],
  );

  const [intialWindow, setInitialWindow] = useState(window);

  // Memoize parameters to prevent creating new object on every render
  const overviewParameters = useMemo(
    () => ({ ...parameters, window_size_samples: 128, overlap_percent: 1 }),
    [parameters]
  );

  // Get the spectrogram image(s) - automatically handles chunked loading for long recordings
  const { draw: drawSpectrogram } = useSpectrogramOverview({
    recording_id: recordingId,
    segment: bounds,
    parameters: overviewParameters,
    withSpectrogram: withSpectrogram,
  });

  // Draw function for the canvas
  const draw = useMemo(
    () => (ctx: CanvasRenderingContext2D) => {
      drawSpectrogram(ctx, bounds);
    },
    [drawSpectrogram, bounds, width, height],
  );

  useCanvas({ ref: canvasRef as React.RefObject<HTMLCanvasElement>, draw });

  const { moveProps } = useWindowDrag({
    window: bounds,
    elementRef: barElementRef,
    onMoveStart: () => setInitialWindow(window),
    onMove: ({ shift: { time, freq } }) => {
      onMove?.({
        time: {
          min: intialWindow.time.min + time,
          max: intialWindow.time.max + time,
        },
        freq: {
          min: intialWindow.freq.min - freq,
          max: intialWindow.freq.max - freq,
        },
      });
    },
    onMoveEnd: () => setInitialWindow(window),
  });

  return (
    <div
      draggable={false}
      className="flex relative flex-row items-center w-full h-8 rounded-md cursor-pointer select-none group outline outline-1 outline-stone-300 bg-stone-200 dark:bg-stone-800 dark:outline-stone-700"
      ref={setBarRef}
    >
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="absolute w-full h-full rounded-md"
      />
      <div
        draggable={false}
        tabIndex={0}
        className="absolute bg-emerald-300/50 rounded-md border border-emerald-500 cursor-pointer dark:bg-emerald-700/50 focus:ring-4 focus:outline-none group-hover:bg-emerald-500/50 hover:bg-emerald-500/50 focus:ring-emerald-500/50"
        {...moveProps}
        style={{
          left: barPosition.left,
          top: barPosition.top,
          width: barPosition.width,
          height: barPosition.height,
        }}
      />
    </div>
  );
}