import { useMemo } from "react";

import { scalePixelsToWindow } from "@/utils/geometry";

import type { Dimensions, Position, SpectrogramWindow } from "@/types";
import type { DOMAttributes, MouseEvent } from "react";
import { SPECTROGRAM_CANVAS_DIMENSIONS } from "@/constants";

export default function useWindowHover<T extends HTMLElement>({
  window,
  enabled = true,
  onHover,
}: {
  window: SpectrogramWindow;
  /** Whether the motion is enabled. */
  enabled?: boolean;
  /** Callback when a click occurs */
  onHover?: (position: Position) => void;
}): DOMAttributes<T> {
  const hoverProps = useMemo(() => {
    return {
      onMouseMove: (e: MouseEvent<T>) => {
        if (!enabled) return;
        
        // Normalize mouse coordinates from screen space to canvas space
        const element = e.currentTarget as unknown as HTMLElement;
        const rect = element.getBoundingClientRect();
        let scaleX = 1;
        let scaleY = 1;
        
        if (element instanceof HTMLCanvasElement) {
          scaleX = element.width / rect.width;
          scaleY = element.height / rect.height;
        } else {
          // For other elements, normalize to SPECTROGRAM_CANVAS_DIMENSIONS
          scaleX = SPECTROGRAM_CANVAS_DIMENSIONS.width / rect.width;
          scaleY = SPECTROGRAM_CANVAS_DIMENSIONS.height / rect.height;
        }
        
        const point = {
          x: e.nativeEvent.offsetX * scaleX,
          y: e.nativeEvent.offsetY * scaleY,
        };
        const position = scalePixelsToWindow(point, window);
        onHover?.(position);
      },
    };
  }, [window, enabled, onHover]);
  if (!enabled) return {};
  return hoverProps;
}
