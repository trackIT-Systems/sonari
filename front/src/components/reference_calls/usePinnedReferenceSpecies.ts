import { useCallback, useState } from "react";

export type SpeciesTag = { key: string; value: string };

function storageKey(annotationProjectId: number) {
  return `sonari:reference-calls:pinned:${annotationProjectId}`;
}

function read(annotationProjectId: number): SpeciesTag | null {
  try {
    const raw = localStorage.getItem(storageKey(annotationProjectId));
    if (raw == null) return null;
    const parsed = JSON.parse(raw) as Partial<SpeciesTag>;
    return typeof parsed.key === "string" && typeof parsed.value === "string"
      ? { key: parsed.key, value: parsed.value }
      : null;
  } catch {
    return null;
  }
}

/**
 * The species whose reference calls are pinned to a project's tasks page, kept in
 * this browser so the gallery is there again on the next visit.
 */
export default function usePinnedReferenceSpecies(annotationProjectId: number | undefined) {
  const [pinned, setPinnedState] = useState<SpeciesTag | null>(() =>
    annotationProjectId == null ? null : read(annotationProjectId),
  );

  const setPinned = useCallback(
    (tag: SpeciesTag | null) => {
      setPinnedState(tag);
      if (annotationProjectId == null) return;
      try {
        if (tag == null) {
          localStorage.removeItem(storageKey(annotationProjectId));
        } else {
          localStorage.setItem(storageKey(annotationProjectId), JSON.stringify(tag));
        }
      } catch {
        // Storage unavailable: the pin lasts for this visit only
      }
    },
    [annotationProjectId],
  );

  return { pinned, setPinned } as const;
}
