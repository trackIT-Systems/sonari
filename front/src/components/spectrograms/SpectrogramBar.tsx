import { useMemo, useRef, useState } from "react";
import useCanvas from "@/hooks/draw/useCanvas";
import useSpectrogramWindow from "@/hooks/spectrogram/useSpectrogramWindow";
import useWindowDrag from "@/hooks/window/useWindowDrag";
import { getViewportPosition } from "@/utils/windows";

import type { SpectrogramWindow, Recording, SpectrogramParameters } from "@/types";

export default function SpectrogramBar({
  bounds,
  viewport,
  onMove,
  recording,
  parameters,
  withSpectrogram,
}: {
  bounds: SpectrogramWindow;
  viewport: SpectrogramWindow;
  recording: Recording;
  parameters: SpectrogramParameters;
  withSpectrogram: boolean;
  onMove?: (viewport: SpectrogramWindow) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const { width, height } = barRef.current?.getBoundingClientRect() ?? {
    width: 0,
    height: 0,
  };

  const barPosition = useMemo(
    () =>
      getViewportPosition({
        width,
        height,
        viewport,
        bounds,
      }),
    [viewport, bounds, width, height],
  );

  const [intialViewport, setInitialViewport] = useState(viewport);

  // Get the complete spectrogram image
  const { draw: drawFullSpectrogram } = useSpectrogramWindow({
    recording,
    window: bounds,
    parameters,
    withSpectrogram,
    lowRes: true,
  });

  // Draw function for the canvas
  const draw = useMemo(
    () => (ctx: CanvasRenderingContext2D) => {
      // Draw the full spectrogram
      drawFullSpectrogram(ctx, bounds);
    },
    [drawFullSpectrogram, bounds]
  );

  useCanvas({ ref: canvasRef as React.RefObject<HTMLCanvasElement>, draw });

  const { moveProps } = useWindowDrag({
    dimensions: { width, height },
    viewport: bounds,
    onMoveStart: () => setInitialViewport(viewport),
    onMove: ({ shift: { time, freq } }) => {
      onMove?.({
        time: {
          min: intialViewport.time.min + time,
          max: intialViewport.time.max + time,
        },
        freq: {
          min: intialViewport.freq.min - freq,
          max: intialViewport.freq.max - freq,
        },
      });
    },
    onMoveEnd: () => setInitialViewport(viewport),
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