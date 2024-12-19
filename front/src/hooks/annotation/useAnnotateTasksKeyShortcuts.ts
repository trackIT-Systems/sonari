import { useKeyPressEvent } from "react-use";

import useKeyFilter from "@/hooks/utils/useKeyFilter";

import type { KeyShortcut } from "@/hooks/utils/useKeyFilter";
import {
  ACCEPT_TASK_SHORTCUT,
  ADD_TAG_SHORTCUT,
  NEXT_TASK_SHORTCUT,
  PREV_TASK_SHORTCUT,
  REJECT_TASK_SHORTCUT,
  REPLACE_TAG_SHORTCUT,
  UNSURE_TASK_SHORTCUT,
  VERIFY_TASK_SHORTCUT,
} from "@/utils/keyboard";

export const ANNOTATE_TASKS_KEY_SHORTCUTS: KeyShortcut[] = [
  {
    label: "Next",
    shortcut: NEXT_TASK_SHORTCUT,
    description: "Go to next annotation task",
  },
  {
    label: "Previous",
    shortcut: PREV_TASK_SHORTCUT,
    description: "Go to previous annotation task",
  },
  {
    label: "Mark Accept",
    shortcut: ACCEPT_TASK_SHORTCUT,
    description: "Mark the annotation task as accepted",
  },
  {
    label: "Mark Reject",
    shortcut: REJECT_TASK_SHORTCUT,
    description: "Mark the annotation task as rejected",
  },
  {
    label: "Mark Verified",
    shortcut: VERIFY_TASK_SHORTCUT,
    description: "Mark the annotation task as verified",
  },
  {
    label: "Mark Unsure",
    shortcut: UNSURE_TASK_SHORTCUT,
    description: "Mark the annotation task as unsure",
  },
  {
    label: "Search & Replace Tags",
    shortcut: REPLACE_TAG_SHORTCUT,
    description: "Open the tag search and replace panel",
  },
  {
    label: "Add ag",
    shortcut: ADD_TAG_SHORTCUT,
    description: "Open panel to add tag to all sound events",
  },
];

export default function useAnnotateTaskKeyShortcuts(props: {
  onGoNext?: () => void;
  onGoPrevious?: () => void;
  onMarkCompleted?: () => void;
  onMarkUnsure?: () => void;
  onMarkRejected?: () => void;
  onMarkVerified?: () => void;
  onSearchReplaceTags?: () => void;
  onAddTags?: () => void;
  enabled?: boolean;
}) {
  const {
    onGoNext,
    onGoPrevious,
    onMarkCompleted,
    onMarkUnsure,
    onMarkRejected,
    onMarkVerified,
    onSearchReplaceTags,
    onAddTags,
    enabled = true,
  } = props;

  useKeyPressEvent(useKeyFilter({ enabled, key: NEXT_TASK_SHORTCUT }), onGoNext);
  useKeyPressEvent(useKeyFilter({ enabled, key: PREV_TASK_SHORTCUT }), onGoPrevious);
  useKeyPressEvent(useKeyFilter({ enabled, key: ACCEPT_TASK_SHORTCUT }), onMarkCompleted);
  useKeyPressEvent(useKeyFilter({ enabled, key: UNSURE_TASK_SHORTCUT }), onMarkUnsure);
  useKeyPressEvent(useKeyFilter({ enabled, key: REJECT_TASK_SHORTCUT }), onMarkRejected);
  useKeyPressEvent(useKeyFilter({ enabled, key: VERIFY_TASK_SHORTCUT }), onMarkVerified);
  useKeyPressEvent(useKeyFilter({ enabled, key: REPLACE_TAG_SHORTCUT }), onSearchReplaceTags);
  useKeyPressEvent(useKeyFilter({ enabled, key: ADD_TAG_SHORTCUT }), onAddTags);
}
