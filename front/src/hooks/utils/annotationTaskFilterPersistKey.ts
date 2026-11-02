/** localStorage key for task-list and annotate-view filters within one annotation project. */
export function annotationTaskFilterPersistKey(
  annotationProjectId: number | undefined | null,
): string | undefined {
  if (annotationProjectId == null) {
    return undefined;
  }
  return `filters:annotation_tasks:project:${annotationProjectId}`;
}

/** Drop persisted task filters (e.g. when opening Tasks/Annotate from project overview). */
export function clearAnnotationTaskFilterPersist(
  annotationProjectId: number | undefined | null,
): void {
  const key = annotationTaskFilterPersistKey(annotationProjectId);
  if (!key || typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/**
 * Write the persisted task filter right away. The filter hook persists with a
 * debounce, which is too late when a new tab or page reads it immediately.
 */
export function writeAnnotationTaskFilterPersist(
  annotationProjectId: number | undefined | null,
  filter: object,
): void {
  const key = annotationTaskFilterPersistKey(annotationProjectId);
  if (!key || typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(filter));
  } catch {
    // ignore
  }
}
