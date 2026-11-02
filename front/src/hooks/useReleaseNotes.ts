import { useCallback, useEffect, useMemo, useState } from "react";

import {
  getSeenReleaseTag,
  setSeenReleaseTag,
} from "@/utils/releaseNotesStorage";
import {
  getReleaseNotes,
  getReleaseTag,
  type ReleaseNotesEntry,
} from "@/utils/version";

export function useReleaseNotes(userId: string) {
  const tag = useMemo(() => getReleaseTag(), []);
  const notes = useMemo(() => getReleaseNotes(tag), [tag]);
  const hasNotes = notes !== null;
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!notes) {
      return;
    }
    const seen = getSeenReleaseTag(userId);
    if (seen !== tag) {
      setIsOpen(true);
    }
  }, [userId, tag, notes]);

  const dismiss = useCallback(() => {
    setSeenReleaseTag(userId, tag);
    setIsOpen(false);
  }, [userId, tag]);

  const open = useCallback(() => {
    if (notes) {
      setIsOpen(true);
    }
  }, [notes]);

  return {
    tag,
    notes: notes as ReleaseNotesEntry | null,
    hasNotes,
    isOpen,
    dismiss,
    open,
  };
}
