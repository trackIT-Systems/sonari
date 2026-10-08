import { type WheelEvent, useMemo } from "react";

import { scaleXToWindow, scaleYToWindow } from "@/utils/geometry";

import type { Dimensions, SpectrogramWindow } from "@/types";
import { SPECTROGRAM_CANVAS_DIMENSIONS } from "@/constants";

/**
 * The `useWindowScroll` hook provides functionality to handle window scrolling
 * events, such as mouse wheel scrolls, and calculates the corresponding
 * adjustments to the spectrogram window based on user input.
 */
export default function useWindowScroll({
  window,
  dimensions = SPECTROGRAM_CANVAS_DIMENSIONS,
  onScroll,
  shift = false,
  ctrl = false,
  alt = false,
  enabled = true,
  relative = false,
}: {
  /** The current spectrogram window being displayed in the canvas. */
  window: SpectrogramWindow;
  /** Size of the canvas the window is rendered on. */
  dimensions?: Dimensions;
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

        // Check modifier keys match configuration
        // Note: metaKey (Cmd on Mac) is ignored - we only care about alt, shift, ctrl
        if (
          !enabled ||
          ctrlKey != ctrl ||
          shiftKey != shift ||
          altKey != alt ||
          metaKey  // Ignore events with Meta key pressed
        )
          return;

        // Prevent default browser behavior (e.g., horizontal scroll on shift+wheel)
        event.preventDefault();

        // Determine scroll behavior based on configuration:
        // - shift config = time axis (zoom)
        // - ctrl config = freq axis (zoom)
        // - alt config = freq axis (pan)
        // - no modifiers = both axes (trackpad: deltaX→time, deltaY→freq)
        const isDefaultScroll = !shift && !ctrl && !alt;
        const isTimeZoom = shift;
        const isFreqZoom = ctrl;
        const isFreqPan = alt;

        // When shift is pressed, browsers swap deltaY to deltaX for horizontal scrolling
        const delta = shiftKey ? (deltaX || deltaY) : deltaY;

        // Handle scroll
        if (relative) {
          // Zooming (relative scaling)
          if (isTimeZoom) {
            return onScroll?.({ timeRatio: delta / dimensions.width });
          } else if (isFreqZoom) {
            return onScroll?.({ freqRatio: delta / dimensions.height });
          }
        } else {
          // Panning (absolute movement)
          if (isDefaultScroll) {
            // Default scroll: deltaX (horizontal) → time, deltaY (vertical) → freq
            const deltaTime = scaleXToWindow(deltaX, window, true, dimensions);
            const deltaFreq = scaleYToWindow(deltaY, window, true, dimensions);
            return onScroll?.({ time: deltaTime, freq: -deltaFreq });
          } else if (isFreqPan) {
            // Alt + scroll: move in frequency
            const deltaFreq = scaleYToWindow(deltaY, window, true, dimensions);
            return onScroll?.({ freq: -deltaFreq });
          }
        }
      },
    };
  }, [enabled, onScroll, ctrl, shift, alt, relative, window, dimensions]);

  return {
    scrollProps,
  };
}
