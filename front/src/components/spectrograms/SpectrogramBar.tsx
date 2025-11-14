import { useMemo, useRef, useState } from "react";
import useCanvas from "@/hooks/draw/useCanvas";
import useWindowDrag from "@/hooks/window/useWindowDrag";
import { getWindowPosition } from "@/utils/windows";

import type { SpectrogramWindow, SpectrogramParameters } from "@/types";

export default function SpectrogramBar({
  bounds,
  window,
  onMove,
  recording_id,
  samplerate,
  parameters,
  withSpectrogram,
}: {
  bounds: SpectrogramWindow;
  window: SpectrogramWindow;
  recording_id: number;
  samplerate: number;
  parameters: SpectrogramParameters;
  withSpectrogram: boolean;
  onMove?: (window: SpectrogramWindow) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const { width, height } = barRef.current?.getBoundingClientRect() ?? {
    width: 0,
    height: 0,
  };

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

  // Get the complete spectrogram image
  // const { draw: drawFullSpectrogram } = useSpectrogramSegment({
  //   recording_id,
  //   samplerate,
  //   segment: bounds,
  //   parameters,
  //   withSpectrogram,
  //   lowRes: true,
  // });

  // // Draw function for the canvas
  // const draw = useMemo(
  //   () => (ctx: CanvasRenderingContext2D) => {
  //     // Draw the full spectrogram
  //     drawFullSpectrogram(ctx, bounds);
  //   },
  //   [drawFullSpectrogram, bounds]
  // );

  // useCanvas({ ref: canvasRef as React.RefObject<HTMLCanvasElement>, draw });

  const { moveProps } = useWindowDrag({
    window: bounds,
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
      ref={barRef}
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