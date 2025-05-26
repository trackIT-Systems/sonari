import { useKeyPressEvent } from "react-use";

import useKeyFilter from "@/hooks/utils/useKeyFilter";

import {
  CREATE_SOUND_EVENT_SHORTCUT,
  DELETE_SOUND_EVENT_SHORTCUT,
  PREVIOUS_SOUND_EVENT_SHORTCUT,
  NEXT_SOUND_EVENT_SHORTCUT,
  SELECT_SOUND_EVENT_SHORTCUT,
  MEASURE_SHORTCUT,
} from "@/utils/keyboard";

export default function useAnnotateClipKeyShortcuts(props: {
  onGoMeasure: () => void;
  onGoCreate: () => void;
  onGoSelect: () => void;
  onGoDelete: () => void;
  onGoNext: () => void;
  onGoPrev: () => void;
  enabled?: boolean;
  selectedAnnotation?: { uuid: string } | null;
  onDeleteSelectedAnnotation?: () => void;
}) {
  const { 
    onGoMeasure,
    onGoCreate, 
    onGoSelect, 
    onGoDelete, 
    onGoNext, 
    onGoPrev, 
    enabled = true,
    selectedAnnotation,
    onDeleteSelectedAnnotation,
  } = props;

  // Handler for delete key that checks if there's a selected annotation
  const handleDelete = () => {
    if (selectedAnnotation && onDeleteSelectedAnnotation) {
      onDeleteSelectedAnnotation();
    } else {
      onGoDelete();
    }
  };

  useKeyPressEvent(useKeyFilter({ enabled, key: MEASURE_SHORTCUT }), onGoMeasure);
  useKeyPressEvent(useKeyFilter({ enabled, key: CREATE_SOUND_EVENT_SHORTCUT }), onGoCreate);
  useKeyPressEvent(useKeyFilter({ enabled, key: SELECT_SOUND_EVENT_SHORTCUT }), onGoSelect);
  useKeyPressEvent(useKeyFilter({ enabled, key: DELETE_SOUND_EVENT_SHORTCUT }), handleDelete);
  useKeyPressEvent(useKeyFilter({ enabled, key: NEXT_SOUND_EVENT_SHORTCUT }), onGoNext);
  useKeyPressEvent(useKeyFilter({ enabled, key: PREVIOUS_SOUND_EVENT_SHORTCUT }), onGoPrev);
}