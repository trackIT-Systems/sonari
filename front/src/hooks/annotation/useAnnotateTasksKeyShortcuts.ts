import { useKeyPressEvent } from "react-use";

import useKeyFilter from "@/hooks/utils/useKeyFilter";

import type { KeyShortcut } from "@/hooks/utils/useKeyFilter";

export const ANNOTATE_TASKS_KEY_SHORTCUTS: KeyShortcut[] = [
  {
    label: "Next",
    shortcut: "n",
    description: "Go to next annotation task",
  },
  {
    label: "Previous",
    shortcut: "p",
    description: "Go to previous annotation task",
  },
  {
    label: "Mark Accept",
    shortcut: "a",
    description: "Mark the annotation task as accepted",
  },
  {
    label: "Mark Reject",
    shortcut: "r",
    description: "Mark the annotation task as rejected",
  },
  {
    label: "Mark Verified",
    shortcut: "v",
    description: "Mark the annotation task as verified",
  },
  {
    label: "Mark Unsure",
    shortcut: "u",
    description: "Mark the annotation task as unsure",
  },
  {
    label: "Search & Replace Tags",
    shortcut: "t",
    description: "Open the tag search and replace panel",
  },
  {
    label: "Add ag",
    shortcut: "f",
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

  useKeyPressEvent(useKeyFilter({ enabled, key: "n" }), onGoNext);
  useKeyPressEvent(useKeyFilter({ enabled, key: "p" }), onGoPrevious);
  useKeyPressEvent(useKeyFilter({ enabled, key: "a" }), onMarkCompleted);
  useKeyPressEvent(useKeyFilter({ enabled, key: "u" }), onMarkUnsure);
  useKeyPressEvent(useKeyFilter({ enabled, key: "r" }), onMarkRejected);
  useKeyPressEvent(useKeyFilter({ enabled, key: "v" }), onMarkVerified);
  useKeyPressEvent(useKeyFilter({ enabled, key: "t" }), onSearchReplaceTags);
  useKeyPressEvent(useKeyFilter({ enabled, key: "f" }), onAddTags);
}
