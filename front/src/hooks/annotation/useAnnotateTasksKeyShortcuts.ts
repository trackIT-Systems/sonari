import { useKeyPressEvent } from "react-use";

import useKeyFilter from "@/hooks/utils/useKeyFilter";

import {
  ACCEPT_TASK_SHORTCUT,
  ADD_TAG_SHORTCUT,
  NEXT_TASK_SHORTCUT,
  PREV_TASK_SHORTCUT,
  REJECT_TASK_SHORTCUT,
  UNSURE_TASK_SHORTCUT,
  VERIFY_TASK_SHORTCUT,
} from "@/utils/keyboard";

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

  useKeyPressEvent(useKeyFilter({ enabled, key: NEXT_TASK_SHORTCUT }), (event: KeyboardEvent) => {
    if (!event.ctrlKey) return;
    if (onGoNext) onGoNext();
  });
  useKeyPressEvent(useKeyFilter({ enabled, key: PREV_TASK_SHORTCUT }), (event: KeyboardEvent) => {
    if (!event.ctrlKey) return;
    if (onGoPrevious) onGoPrevious();
  });
  useKeyPressEvent(useKeyFilter({ enabled, key: ACCEPT_TASK_SHORTCUT }), onMarkCompleted);
  useKeyPressEvent(useKeyFilter({ enabled, key: UNSURE_TASK_SHORTCUT }), onMarkUnsure);
  useKeyPressEvent(useKeyFilter({ enabled, key: REJECT_TASK_SHORTCUT }), onMarkRejected);
  useKeyPressEvent(useKeyFilter({ enabled, key: VERIFY_TASK_SHORTCUT }), onMarkVerified);
  useKeyPressEvent(useKeyFilter({ enabled, key: ADD_TAG_SHORTCUT }), onAddTags);
}
