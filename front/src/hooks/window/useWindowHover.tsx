import { useMemo } from "react";

import { scalePixelsToWindow } from "@/utils/geometry";

import type { Dimensions, Position, SpectrogramWindow } from "@/types";
import type { DOMAttributes, MouseEvent } from "react";

export default function useWindowHover<T extends HTMLElement>({
  window,
  dimensions,
  enabled = true,
  onHover,
}: {
  window: SpectrogramWindow;
  /** The dimensions of the canvas. */
  dimensions: Dimensions;
  /** Whether the motion is enabled. */
  enabled?: boolean;
  /** Callback when a click occurs */
  onHover?: (position: Position) => void;
}): DOMAttributes<T> {
  const hoverProps = useMemo(() => {
    return {
      onMouseMove: (e: MouseEvent<T>) => {
        if (!enabled) return;
        const point = {
          x: e.nativeEvent.offsetX,
          y: e.nativeEvent.offsetY,
        };
        const position = scalePixelsToWindow(point, window, dimensions);
        onHover?.(position);
      },
    };
  }, [window, dimensions, enabled, onHover]);
  if (!enabled) return {};
  return hoverProps;
}
