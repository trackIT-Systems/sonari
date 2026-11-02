import { useMemo } from "react";

import type { DOMAttributes } from "react";

/** Factor from CSS pixels to canvas pixels; 1 for anything but a canvas. */
export function getCanvasScale(element: unknown): { x: number; y: number } {
  if (!(element instanceof HTMLCanvasElement)) return { x: 1, y: 1 };
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return { x: 1, y: 1 };
  return { x: element.width / rect.width, y: element.height / rect.height };
}

export default function useHover<T>({
  enabled = true,
  onHover,
}: {
  enabled?: boolean;
  onHover: ({
    position,
    shift,
    ctrl,
  }: {
    position: { x: number; y: number };
    shift: boolean;
    ctrl: boolean;
  }) => void;
}): DOMAttributes<T> {
  const props = useMemo(
    () => ({
      onMouseMove: (e: React.MouseEvent<T>) => {
        // Hit testing happens in canvas pixels, which differ from CSS pixels
        // whenever the canvas is displayed larger or smaller than it is.
        const { x: scaleX, y: scaleY } = getCanvasScale(e.currentTarget);
        const x = e.nativeEvent.offsetX * scaleX;
        const y = e.nativeEvent.offsetY * scaleY;
        onHover({
          position: { x, y },
          shift: e.shiftKey,
          ctrl: e.ctrlKey,
        });
      },
    }),
    [onHover],
  );

  if (!enabled) {
    return {};
  }

  return props;
}
