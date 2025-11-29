import { useCallback, useEffect, useRef } from "react";

import type { DOMAttributes, RefObject } from "react";

const POPOVER_ID = "position-popover";

export type AxisBounds = {
  min: number;
  max: number;
};

export type PositionPopoverOptions = {
  /** Bounds for the X axis (left to right) */
  xBounds: AxisBounds;
  /** Bounds for the Y axis (bottom to top, will be inverted) */
  yBounds: AxisBounds;
  /** Format function for the X coordinate */
  formatX?: (value: number) => string;
  /** Format function for the Y coordinate */
  formatY?: (value: number) => string;
  /** Whether the popover is enabled */
  enabled?: boolean;
};

function defaultFormatX(value: number): string {
  return value.toFixed(2);
}

function defaultFormatY(value: number): string {
  return value.toFixed(2);
}

function getOrCreatePopover(): HTMLDivElement {
  let popover = document.getElementById(POPOVER_ID) as HTMLDivElement | null;
  if (popover == null) {
    popover = document.createElement("div");
    popover.setAttribute("id", POPOVER_ID);
    popover.style.position = "absolute";
    popover.style.background = "rgba(28, 25, 23, 0.7)";
    popover.style.color = "rgb(245, 245, 244)";
    popover.style.fontSize = "0.75rem";
    popover.style.borderRadius = "6px";
    popover.style.pointerEvents = "none";
    popover.style.display = "none";
    popover.style.zIndex = "9999";
    document.body.appendChild(popover);
  }
  return popover;
}

/**
 * A hook that displays a popover with coordinates when hovering over an element.
 * The popover shows the X and Y values based on the mouse position within the element,
 * mapped to the provided axis bounds.
 *
 * @param ref - Reference to the target HTML element
 * @param options - Configuration options including axis bounds and formatters
 * @returns DOM attributes to spread on the target element
 */
export default function usePositionPopover<T extends HTMLElement>(
  ref: RefObject<T | null>,
  options: PositionPopoverOptions
): DOMAttributes<T> {
  const {
    enabled = true,
  } = options;

  // Store options in a ref to avoid recreating callbacks
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<T>) => {
      if (!ref.current) return;

      const { xBounds, yBounds, formatX = defaultFormatX, formatY = defaultFormatY } =
        optionsRef.current;

      const rect = ref.current.getBoundingClientRect();

      // Calculate mouse coordinates relative to the element
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;

      // Calculate the scaling factors using the rendered dimensions
      const scaleX = (xBounds.max - xBounds.min) / rect.width;
      const scaleY = (yBounds.max - yBounds.min) / rect.height;

      // Translate element coordinates to data coordinates
      // X: left to right (normal)
      // Y: bottom to top (inverted - origin at bottom)
      const xValue = mouseX * scaleX + xBounds.min;
      const yValue = (rect.height - mouseY) * scaleY + yBounds.min;

      const popover = getOrCreatePopover();
      popover.innerText = `${formatX(xValue)}, ${formatY(yValue)}`;
      popover.style.padding = "4px 8px";
      popover.style.display = "block";

      const padding = 8;
      const offsetDistanceX = 120; // Distance from top-left corner to trigger offset
      const offsetDistanceY = 50; // Distance from top-left corner to trigger offset

      // Check if mouse is near the top-left corner
      const isNearTopLeft = mouseX < offsetDistanceX && mouseY < offsetDistanceY;

      if (isNearTopLeft) {
        // Mouse is near top-left, offset the popover to avoid obscuring
        popover.style.left = `${event.pageX + 15}px`;
        popover.style.top = `${event.pageY + 15}px`;
      } else {
        // Default: always position in top-left corner of the element
        popover.style.left = `${rect.left + window.scrollX + padding}px`;
        popover.style.top = `${rect.top + window.scrollY + padding}px`;
      }
    },
    [ref]
  );

  const handleMouseLeave = useCallback(() => {
    const popover = document.getElementById(POPOVER_ID);
    if (popover) {
      popover.style.display = "none";
    }
  }, []);

  // Clean up popover on unmount
  useEffect(() => {
    return () => {
      const popover = document.getElementById(POPOVER_ID);
      if (popover) {
        popover.style.display = "none";
      }
    };
  }, []);

  if (!enabled) {
    return {};
  }

  return {
    onMouseMove: handleMouseMove,
    onMouseLeave: handleMouseLeave,
  };
}

