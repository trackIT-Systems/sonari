import { type MouseEvent, useCallback, useMemo, useState } from "react";
import { mergeProps } from "react-aria";

import useWindowDrag from "@/hooks/window/useWindowDrag";
import { scalePixelsToWindow } from "@/utils/geometry";

import type { EventKeys } from "@/hooks/utils/useDrag";
import type { Position, SpectrogramWindow } from "@/types";
import { SPECTROGRAM_CANVAS_DIMENSIONS } from "@/constants";

/**
 * Hook for handling window motions on a spectrogram.
 */
export default function useWindowMotions({
  window,
  elementRef,
  enabled = true,
  onClick,
  onDoubleClick,
  onMoveStart,
  onMove,
  onMoveEnd,
}: {
  /** The current spectrogram window displayed on canvas. */
  window: SpectrogramWindow;
  /** Optional ref to the canvas/element for coordinate normalization. */
  elementRef?: React.RefObject<HTMLElement | null>;
  /** Whether the motion is enabled. */
  enabled?: boolean;
  /** Callback when a click occurs */
  onClick?: (
    clickProps: {
      position: Position;
    } & EventKeys,
  ) => void;
  onDoubleClick?: (
    clickProps: {
      position: Position;
    } & EventKeys,
  ) => void;
  /** Callback when motion starts.
   * A motion starts when the mouse is pressed down and starts moving.
   * It is not triggered when the mouse is pressed down but not moving.
   */
  onMoveStart?: (keys?: EventKeys) => void;
  /** Callback during motion.
   * This motion is triggered when the mouse is pressed down and moving.
   * Every time the mouse moves, this callback is triggered.
   */
  onMove?: (
    moveProps: {
      initial: Position;
      shift: Position;
    } & EventKeys,
  ) => void;
  /* Callback when motion ends. */
  onMoveEnd?: (keys?: EventKeys) => void;
}) {
  const [initialPosition, setInitialPosition] = useState<Position | null>(null);

  const clickProps = useMemo(() => {
    const handleClick = (e: MouseEvent) => {
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
      setInitialPosition(position);
      onClick?.({
        position,
        shiftKey: e.shiftKey,
        ctrlKey: e.ctrlKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
      });

      if (e.detail === 2) {
        onDoubleClick?.({
          position,
          shiftKey: e.shiftKey,
          ctrlKey: e.ctrlKey,
          altKey: e.altKey,
          metaKey: e.metaKey,
        });
      }
    };

    return {
      onMouseDown: handleClick,
      onPointerDown: handleClick,
      onClick: handleClick,
    };
  }, [enabled, window, onClick, onDoubleClick]);

  const handleMoveStart = useCallback(
    ({ shiftKey, ctrlKey, altKey, metaKey }: EventKeys = {}) => {
      if (!enabled) return;
      onMoveStart?.({
        shiftKey,
        ctrlKey,
        altKey,
        metaKey,
      });
    },
    [enabled, onMoveStart],
  );

  const handleMove = useCallback(
    ({
      shift,
      shiftKey,
      ctrlKey,
      altKey,
      metaKey,
    }: {
      shift: Position;
    } & EventKeys) => {
      if (!enabled || initialPosition == null) return;
      onMove?.({
        initial: initialPosition,
        shift,
        shiftKey,
        ctrlKey,
        altKey,
        metaKey,
      });
    },
    [initialPosition, enabled, onMove],
  );

  const handleMoveEnd = useCallback(
    ({ shiftKey, ctrlKey, altKey, metaKey }: EventKeys = {}) => {
      if (!enabled) return;
      setInitialPosition(null);
      onMoveEnd?.({
        shiftKey,
        ctrlKey,
        altKey,
        metaKey,
      });
    },
    [enabled, onMoveEnd],
  );

  const { moveProps, isDragging } = useWindowDrag({
    window,
    elementRef,
    onMoveStart: handleMoveStart,
    onMove: handleMove,
    onMoveEnd: handleMoveEnd,
  });

  const props = mergeProps(moveProps, clickProps);

  return {
    props,
    isDragging,
  };
}
