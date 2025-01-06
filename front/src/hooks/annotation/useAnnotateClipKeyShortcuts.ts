import { useKeyPressEvent } from "react-use";

import useKeyFilter from "@/hooks/utils/useKeyFilter";

import {
  CREATE_SOUND_EVENT_SHORTCUT,
  DELETE_SOUND_EVENT_SHORTCUT,
  PREVIOUS_SOUND_EVENT_SHORTCUT,
  NEXT_SOUND_EVENT_SHORTCUT,
  SELECT_SOUND_EVENT_SHORTCUT,
} from "@/utils/keyboard";

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
