import { useKeyPressEvent } from "react-use";

import useKeyFilter from "@/hooks/utils/useKeyFilter";

import {
  LOCK_ASPECT_RATIO_SHORTCUT,
  ZOOM_SHORTCUT,
  ZOOM_IN_SHORTCUT,
  ZOOM_OUT_SHORTCUT,
  MOVE_LEFT_SHORTCUT,
  MOVE_RIGHT_SHORTCUT,
  MOVE_DOWN_SHORTCUT,
  MOVE_UP_SHORTCUT,
  RESET_ZOOM_SHORTCUT,
} from "@/utils/keyboard";

export default function useAnnotateClipKeyShortcuts(props: {
  onGoZoom: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomInFreq: () => void;
  onZoomOutFreq: () => void;
  onResetZoom: () => void;
  onToggleAspectRatio: () => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  enabled?: boolean;
}) {
  const {
    onGoZoom,
    onZoomIn,
    onZoomOut,
    onZoomInFreq,
    onZoomOutFreq,
    onResetZoom,
    onToggleAspectRatio,
    onMoveLeft,
    onMoveRight,
    onMoveUp,
    onMoveDown,
    enabled = true
  } = props;

  useKeyPressEvent(useKeyFilter({ enabled, key: ZOOM_SHORTCUT }), onGoZoom);
  useKeyPressEvent(useKeyFilter({ enabled, key: ZOOM_IN_SHORTCUT }), (event: KeyboardEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.ctrlKey) {
      onZoomInFreq()
    } else {
      onZoomIn()
    }
  });
  useKeyPressEvent(useKeyFilter({ enabled, key: ZOOM_OUT_SHORTCUT }), (event: KeyboardEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.ctrlKey) {
      onZoomOutFreq()
    } else {
      onZoomOut()
    }
  });
  useKeyPressEvent(useKeyFilter({ enabled, key: RESET_ZOOM_SHORTCUT }), onResetZoom)
  useKeyPressEvent(useKeyFilter({ enabled, key: LOCK_ASPECT_RATIO_SHORTCUT }), onToggleAspectRatio);
  useKeyPressEvent(useKeyFilter({ enabled, key: MOVE_LEFT_SHORTCUT }), onMoveLeft);
  useKeyPressEvent(useKeyFilter({ enabled, key: MOVE_RIGHT_SHORTCUT }), onMoveRight);
  useKeyPressEvent(useKeyFilter({ enabled, key: MOVE_UP_SHORTCUT }), onMoveUp);
  useKeyPressEvent(useKeyFilter({ enabled, key: MOVE_DOWN_SHORTCUT }), onMoveDown);
}
