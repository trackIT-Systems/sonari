import { type MouseEvent, useCallback, useMemo, useRef, useState } from "react";
import { mergeProps } from "react-aria";

import useWindowDrag from "@/hooks/window/useWindowDrag";
import { scalePixelsToWindow } from "@/utils/geometry";

import type { EventKeys } from "@/hooks/utils/useDrag";
import type { Dimensions, Position, SpectrogramWindow } from "@/types";
import { SPECTROGRAM_CANVAS_DIMENSIONS } from "@/constants";

/**
 * Hook for handling window motions on a spectrogram.
 */
export default function useWindowMotions({
  window,
  elementRef,
  dimensions = SPECTROGRAM_CANVAS_DIMENSIONS,
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
  /** Size of the canvas the window is rendered on. */
  dimensions?: Dimensions;
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
  // The element a gesture started on, so drag deltas (CSS pixels) can be
  // converted to canvas pixels when the canvas is displayed scaled.
  const pressedElementRef = useRef<HTMLElement | null>(null);

  const clickProps = useMemo(() => {
    const handleClick = (e: MouseEvent) => {
      if (!enabled) return;
      
      // Normalize mouse coordinates from screen space to `dimensions`, the
      // space the window is mapped to. Not to the canvas' own width and
      // height: a canvas drawn at screen resolution has a backing store of
      // `dimensions` times the device pixel ratio.
      const element = e.currentTarget as unknown as HTMLElement;
      pressedElementRef.current = element;
      const rect = element.getBoundingClientRect();
      const scaleX = rect.width > 0 ? dimensions.width / rect.width : 1;
      const scaleY = rect.height > 0 ? dimensions.height / rect.height : 1;

      const point = {
        x: e.nativeEvent.offsetX * scaleX,
        y: e.nativeEvent.offsetY * scaleY,
      };
      const position = scalePixelsToWindow(point, window, false, dimensions);
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
  }, [enabled, window, onClick, onDoubleClick, dimensions]);

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
    elementRef: elementRef ?? pressedElementRef,
    dimensions,
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
