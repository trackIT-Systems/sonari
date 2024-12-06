import { useKeyPressEvent } from "react-use";

import useKeyFilter from "@/hooks/utils/useKeyFilter";

import type { KeyShortcut } from "@/hooks/utils/useKeyFilter";

export const SPECTROGRAM_KEY_SHORTCUTS: KeyShortcut[] = [
  {
    label: "Move",
    shortcut: "x",
    description: "Move around the spectrogram",
  },
  {
    label: "Zoom in",
    shortcut: "z",
    description: "Zoom into a selection of the spectrogram",
  },
  {
    label: "Fix aspect ratio",
    shortcut: "l",
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
  onGoMove: () => void;
  onGoZoom: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onToggleAspectRatio: () => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  enabled?: boolean;
}) {
  const { 
    onGoMove, 
    onGoZoom, 
    onZoomIn, 
    onZoomOut, 
    onToggleAspectRatio, 
    onMoveLeft,
    onMoveRight,
    enabled = true 
  } = props;

  useKeyPressEvent(useKeyFilter({ enabled, key: "x" }), onGoMove);
  useKeyPressEvent(useKeyFilter({ enabled, key: "z" }), onGoZoom);
  useKeyPressEvent(useKeyFilter({ enabled, key: "+" }), onZoomIn);
  useKeyPressEvent(useKeyFilter({ enabled, key: "-" }), onZoomOut);
  useKeyPressEvent(useKeyFilter({ enabled, key: "l" }), onToggleAspectRatio);
  useKeyPressEvent(useKeyFilter({ enabled, key: "ArrowLeft" }), onMoveLeft);
  useKeyPressEvent(useKeyFilter({ enabled, key: "ArrowRight" }), onMoveRight);
}
