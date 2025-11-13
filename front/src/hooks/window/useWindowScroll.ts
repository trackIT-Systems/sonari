import { type WheelEvent, useMemo } from "react";

import { scaleXToWindow, scaleYToWindow } from "@/utils/geometry";

import type { SpectrogramWindow } from "@/types";
import { CANVAS_DIMENSIONS } from "@/constants";

/**
 * The `useWindowScroll` hook provides functionality to handle window scrolling
 * events, such as mouse wheel scrolls, and calculates the corresponding
 * adjustments to the spectrogram window based on user input.
 */
export default function useWindowScroll({
  window,
  onScroll,
  shift = false,
  ctrl = false,
  alt = false,
  enabled = true,
  relative = false,
}: {
  /** The current spectrogram window being displayed in the canvas. */
  window: SpectrogramWindow;
  /** The callback function to handle scroll events. */
  onScroll?: ({
    time,
    freq,
    timeRatio,
    freqRatio,
  }: {
    time?: number;
    freq?: number;
    timeRatio?: number;
    freqRatio?: number;
  }) => void;
  /** Indicates whether the Shift key should be pressed. */
  shift?: boolean;
  /** Indicates whether the Ctrl key should be pressed. */
  ctrl?: boolean;
  /** Indicates whether the Alt key should be pressed. */
  alt?: boolean;
  /** If disabled, the hook will not respond to scroll events. */
  enabled?: boolean;
  /** If true, the scroll event will be interpreted as a relative scroll. */
  relative?: boolean;
}) {
  const scrollProps = useMemo(() => {
    return {
      onWheel: (event: WheelEvent) => {
        const { deltaX, deltaY, shiftKey, ctrlKey, altKey, metaKey } = event;

        // Handle trackpad-based scrolling
        if (!relative && !shiftKey && !ctrlKey && !altKey && !metaKey) {
          const deltaTime = scaleXToWindow(
            deltaX,
            window,
            true,
          );
          const deltaFreq = scaleYToWindow(
            deltaY,
            window,
            true,
          );
          return onScroll?.({ time: deltaTime, freq: -deltaFreq });
        }

        const specialKey = metaKey || altKey;
        if (
          !enabled ||
          ctrlKey != ctrl ||
          shiftKey != shift ||
          specialKey != alt
        )
          return;

        // Handle vertical scroll (existing behavior)
        switch (true) {
          case shiftKey && relative:
            return onScroll?.({ timeRatio: deltaY / CANVAS_DIMENSIONS.width });

          case !shiftKey && relative:
            return onScroll?.({ freqRatio: deltaY / CANVAS_DIMENSIONS.height });

          case shiftKey && !relative:
            const deltaTime = scaleXToWindow(
              deltaY,
              window,
              true,
            );
            return onScroll?.({ time: deltaTime });

          case !shiftKey && !relative:
            const deltaFreq = scaleYToWindow(
              deltaY,
              window,
              true,
            );
            return onScroll?.({ freq: -deltaFreq });
        }
      },
    };
  }, [enabled, onScroll, ctrl, shift, alt, relative, window]);

  return {
    scrollProps,
  };
}
