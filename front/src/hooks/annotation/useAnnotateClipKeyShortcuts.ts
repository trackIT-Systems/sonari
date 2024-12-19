import { useKeyPressEvent } from "react-use";

import useKeyFilter from "@/hooks/utils/useKeyFilter";

import type { KeyShortcut } from "@/hooks/utils/useKeyFilter";
import {
  CREATE_SOUND_EVENT_SHORTCUT,
  DELETE_SOUND_EVENT_SHORTCUT,
  PREVIOUS_SOUND_EVENT_SHORTCUT,
  NEXT_SOUND_EVENT_SHORTCUT,
  SOUND_EVENT_CYCLE_FILTER_SHORTCUT,
  SELECT_SOUND_EVENT_SHORTCUT,
  REPLACE_TAG_SHORTCUT,
  DELETE_TAG_SHORTCUT,
} from "@/utils/keyboard";

export const ANNOTATION_KEY_SHORTCUTS: KeyShortcut[] = [
  {
    label: "Add Annotation",
    shortcut: CREATE_SOUND_EVENT_SHORTCUT,
    description: "Add a new annotation",
  },
  {
    label: "Select Annotation",
    shortcut: SELECT_SOUND_EVENT_SHORTCUT,
    description: "Select an annotation",
  },
  {
    label: "Delete Annotation",
    shortcut: DELETE_SOUND_EVENT_SHORTCUT,
    description: "Delete an annotation",
  },
  {
    label: "Select next",
    shortcut: NEXT_SOUND_EVENT_SHORTCUT,
    description: "Select next sound event annotation",
  },
  {
    label: "Select previous",
    shortcut: PREVIOUS_SOUND_EVENT_SHORTCUT,
    description: "Select previous sound event annotation",
  },
  {
    label: "Delete tags",
    shortcut: DELETE_TAG_SHORTCUT,
    description: "Delete a tag from all sound events",
  },
  {
    label: "Replace tags",
    shortcut: REPLACE_TAG_SHORTCUT,
    description: "Replace a (or all) tag(s) in all sound events",
  },
  {
    label: "Cycle filter",
    shortcut: SOUND_EVENT_CYCLE_FILTER_SHORTCUT,
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
  useKeyPressEvent(useKeyFilter({ enabled, key: CREATE_SOUND_EVENT_SHORTCUT }), onGoCreate);
  useKeyPressEvent(useKeyFilter({ enabled, key: SELECT_SOUND_EVENT_SHORTCUT }), onGoSelect);
  useKeyPressEvent(useKeyFilter({ enabled, key: DELETE_SOUND_EVENT_SHORTCUT }), onGoDelete);
  useKeyPressEvent(useKeyFilter({ enabled, key: NEXT_SOUND_EVENT_SHORTCUT }), onGoNext);
  useKeyPressEvent(useKeyFilter({ enabled, key: PREVIOUS_SOUND_EVENT_SHORTCUT }), onGoPrev);
}
