import { useKeyPressEvent } from "react-use";

import useKeyFilter from "@/hooks/utils/useKeyFilter";

import type { KeyShortcut } from "@/hooks/utils/useKeyFilter";
import { LOCK_ASPECT_RATIO_SHORTCUT, ZOOM_SHORTCUT, ZOOM_IN_SHORTCUT, ZOOM_OUT_SHORTCUT, MOVE_LEFT_SHORTCUT, MOVE_RIGHT_SHORTCUT } from "@/utils/keyboard";

export const SPECTROGRAM_KEY_SHORTCUTS: KeyShortcut[] = [
  {
    label: "Zoom in",
    shortcut: ZOOM_SHORTCUT,
    description: "Zoom into a selection of the spectrogram",
  },
  {
    label: "Fix aspect ratio",
    shortcut: LOCK_ASPECT_RATIO_SHORTCUT,
    description: "Toggle fixed aspect ratio for zoom",
  },
  {
    label: "Move Left",
    shortcut: "←",
    description: "Move spectrogram view 10% to the left",
  },
  {
    label: "Move Right",
    shortcut: "→",
    description: "Move spectrogram view 10% to the right",
  },
];

export default function useAnnotateClipKeyShortcuts(props: {
  onGoZoom: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onToggleAspectRatio: () => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  enabled?: boolean;
}) {
  const { 
    onGoZoom, 
    onZoomIn, 
    onZoomOut, 
    onToggleAspectRatio, 
    onMoveLeft,
    onMoveRight,
    enabled = true 
  } = props;

  useKeyPressEvent(useKeyFilter({ enabled, key: ZOOM_SHORTCUT }), onGoZoom);
  useKeyPressEvent(useKeyFilter({ enabled, key: ZOOM_IN_SHORTCUT }), onZoomIn);
  useKeyPressEvent(useKeyFilter({ enabled, key: ZOOM_OUT_SHORTCUT }), onZoomOut);
  useKeyPressEvent(useKeyFilter({ enabled, key: LOCK_ASPECT_RATIO_SHORTCUT }), onToggleAspectRatio);
  useKeyPressEvent(useKeyFilter({ enabled, key: MOVE_LEFT_SHORTCUT }), onMoveLeft);
  useKeyPressEvent(useKeyFilter({ enabled, key: MOVE_RIGHT_SHORTCUT }), onMoveRight);
}
