import { useCallback, useState } from "react";

import useWindowDrag from "@/hooks/window/useWindowDrag";
import useWindowMotions from "@/hooks/window/useWindowMotions";

import type { Position, SpectrogramWindow } from "@/types";

export default function useSpectrogramDrag({
  window,
  dimensions,
  enabled = true,
  onDoubleClick,
  onDragStart,
  onDrag,
  onDragEnd,
}: {
  window: SpectrogramWindow;
  dimensions: { width: number; height: number };
  onDoubleClick?: (dblClickProps: {
    position: Position;
    shiftKey?: boolean;
    altKey?: boolean;
  }) => void;
  onDragStart?: () => void;
  onDrag?: (window: SpectrogramWindow) => void;
  onDragEnd?: () => void;
  enabled?: boolean;
}) {
  const [initialWindow, setInitialWindow] = useState(window);

  const onMoveStart = useCallback(() => {
    if (!enabled) return;
    setInitialWindow(window);
    onDragStart?.();
  }, [onDragStart, window, enabled]);

  const onMove = useCallback(
    ({ shift }: { shift: Position }) => {
      if (!enabled) return;
      const newWindow = {
        time: {
          min: initialWindow.time.min - shift.time,
          max: initialWindow.time.max - shift.time,
        },
        freq: {
          min: initialWindow.freq.min + shift.freq,
          max: initialWindow.freq.max + shift.freq,
        },
      };
      onDrag?.(newWindow);
    },
    [onDrag, initialWindow, enabled],
  );

  const onMoveEnd = useCallback(() => {
    if (!enabled) return;
    setInitialWindow(window);
    onDragEnd?.();
  }, [onDragEnd, window, enabled]);

  const { props: moveProps, isDragging } = useWindowMotions({
    window,
    dimensions,
    onMoveStart,
    onMove,
    onMoveEnd,
    onDoubleClick,
  });

  return {
    dragProps: moveProps,
    isDragging,
  } as const;
}
