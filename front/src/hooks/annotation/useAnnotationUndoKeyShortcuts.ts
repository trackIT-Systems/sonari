import { useRef } from "react";
import { useKeyPressEvent } from "react-use";

import type { HistoryReplayEvent } from "@/hooks/annotation/annotationHistoryTypes";

export type AnnotationHistoryControls = {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  undo: () => Promise<HistoryReplayEvent[]>;
  redo: () => Promise<HistoryReplayEvent[]>;
  runBatch: <T>(label: string, fn: () => Promise<T>) => Promise<T>;
};

export default function useAnnotationUndoKeyShortcuts({
  enabled = true,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
}: {
  enabled?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
}) {
  // useKeyPressEvent memoizes its filter with unstable deps; refs keep handlers current.
  const enabledRef = useRef(enabled);
  const canUndoRef = useRef(canUndo);
  const canRedoRef = useRef(canRedo);
  const onUndoRef = useRef(onUndo);
  const onRedoRef = useRef(onRedo);
  enabledRef.current = enabled;
  canUndoRef.current = canUndo;
  canRedoRef.current = canRedo;
  onUndoRef.current = onUndo;
  onRedoRef.current = onRedo;

  useKeyPressEvent(
    (event) => {
      if (event.type !== "keydown") {
        return false;
      }
      if (!enabledRef.current) {
        return false;
      }
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return false;
      }

      const meta = event.metaKey || event.ctrlKey;
      if (!meta) {
        return false;
      }

      if (event.key.toLowerCase() === "z" && !event.shiftKey) {
        if (!canUndoRef.current) {
          return false;
        }
        event.preventDefault();
        event.stopPropagation();
        onUndoRef.current?.();
        return true;
      }

      if (event.key.toLowerCase() === "z" && event.shiftKey) {
        if (!canRedoRef.current) {
          return false;
        }
        event.preventDefault();
        event.stopPropagation();
        onRedoRef.current?.();
        return true;
      }

      return false;
    },
  );
}
