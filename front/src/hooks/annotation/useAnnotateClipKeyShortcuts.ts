import { useKeyPressEvent } from "react-use";

import useKeyFilter from "@/hooks/utils/useKeyFilter";

import type { KeyShortcut } from "@/hooks/utils/useKeyFilter";

export const ANNOTATION_KEY_SHORTCUTS: KeyShortcut[] = [
  {
    label: "Add Annotation",
    shortcut:"c",
    description: "Add a new annotation",
  },
  {
    label: "Select Annotation",
    shortcut: "s",
    description: "Select an annotation",
  },
  {
    label: "Delete Annotation",
    shortcut: "d",
    description: "Delete an annotation",
  },
  {
    label: "Select next",
    shortcut: "k",
    description: "Select next sound event annotation",
  },
  {
    label: "Select previous",
    shortcut: "j",
    description: "Select previous sound event annotation",
  },
  {
    label: "Delete tags",
    shortcut: "y",
    description: "Delete a tag from all sound events",
  },
  {
    label: "Replace tags",
    shortcut: "t",
    description: "Replace a (or all) tag(s) in all sound events",
  },
  {
    label: "Cycle filter",
    shortcut: "m",
    description: "Set or remove tag that will be used for selecting next or previous sound event",
  },
];

export default function useAnnotateClipKeyShortcuts(props: {
  onGoCreate: () => void;
  onGoSelect: () => void;
  onGoDelete: () => void;
  onGoNext: () => void;
  onGoPrev: () => void;
  enabled?: boolean;
}) {
  const { onGoCreate, onGoSelect, onGoDelete, onGoNext, onGoPrev, enabled = true } = props;
  useKeyPressEvent(useKeyFilter({ enabled, key: "c" }), onGoCreate);
  useKeyPressEvent(useKeyFilter({ enabled, key: "s" }), onGoSelect);
  useKeyPressEvent(useKeyFilter({ enabled, key: "d" }), onGoDelete);
  useKeyPressEvent(useKeyFilter({ enabled, key: "k" }), onGoNext);
  useKeyPressEvent(useKeyFilter({ enabled, key: "j" }), onGoPrev);
}
