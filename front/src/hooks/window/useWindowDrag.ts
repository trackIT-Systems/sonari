import { useCallback, useState } from "react";
import { useMove } from "react-aria";

import { scalePixelsToWindow } from "@/utils/geometry";
import { SPECTROGRAM_CANVAS_DIMENSIONS } from "@/constants";

import type { EventKeys } from "@/hooks/utils/useDrag";
import type { Dimensions, Position, SpectrogramWindow } from "@/types";

/**
 * The `useDrag` hook manages dragging behavior for an object
 * within a specified window.
 *
 */
export default function useWindowDrag({
  window,
  elementRef,
  dimensions = SPECTROGRAM_CANVAS_DIMENSIONS,
  onMoveStart,
  onMove,
  onMoveEnd,
}: {
  window: SpectrogramWindow;
  elementRef?: React.RefObject<HTMLElement | null>;
  /** Size of the canvas the window is rendered on. */
  dimensions?: Dimensions;
  onMoveStart?: (moveStartProps?: EventKeys) => void;
  onMove?: (moveProps: { shift: Position } & EventKeys) => void;
  onMoveEnd?: (moveEndProps?: EventKeys) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const handleMove = useCallback(
    ({
      deltaX,
      deltaY,
      shiftKey,
      altKey,
      ctrlKey,
      metaKey,
    }: { deltaX: number; deltaY: number } & EventKeys) => {
      // Normalize deltas from screen space to canvas space
      let normalizedDeltaX = deltaX;
      let normalizedDeltaY = deltaY;
      
      if (elementRef?.current) {
        const element = elementRef.current;
        const rect = element.getBoundingClientRect();
        
        // Check if it's a canvas element
        if (element instanceof HTMLCanvasElement) {
          const scaleX = element.width / rect.width;
          const scaleY = element.height / rect.height;
          normalizedDeltaX = deltaX * scaleX;
          normalizedDeltaY = deltaY * scaleY;
        } else {
          // For other elements (like divs), normalize to the canvas dimensions
          const scaleX = dimensions.width / rect.width;
          const scaleY = dimensions.height / rect.height;
          normalizedDeltaX = deltaX * scaleX;
          normalizedDeltaY = deltaY * scaleY;
        }
      }
      
      setPosition(({ x, y }) => ({ x: x + normalizedDeltaX, y: y + normalizedDeltaY }));
      const shift = scalePixelsToWindow(
        {
          x: position.x + normalizedDeltaX,
          y: position.y + normalizedDeltaY,
        },
        window,
        true,
        dimensions,
      );
      onMove?.({
        shift,
        shiftKey,
        altKey,
        ctrlKey,
        metaKey,
      });
    },
    [position, window, onMove, elementRef, dimensions],
  );

  const handleMoveStart = useCallback(
    ({ shiftKey, altKey, ctrlKey, metaKey }: EventKeys) => {
      setPosition({ x: 0, y: 0 });
      setIsDragging(true);
      onMoveStart?.({
        shiftKey,
        altKey,
        ctrlKey,
        metaKey,
      });
    },
    [onMoveStart],
  );

  const handleMoveEnd = useCallback(
    ({ shiftKey, altKey, ctrlKey, metaKey }: EventKeys) => {
      setPosition({ x: 0, y: 0 });
      onMoveEnd?.({
        shiftKey,
        altKey,
        ctrlKey,
        metaKey,
      });
    },
    [onMoveEnd],
  );

  const { moveProps } = useMove({
    onMoveStart: handleMoveStart,
    onMove: handleMove,
    onMoveEnd: handleMoveEnd,
  });

  return {
    moveProps,
    isDragging,
    shift: position,
  };
}
