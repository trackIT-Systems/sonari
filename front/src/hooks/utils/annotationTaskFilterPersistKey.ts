/** localStorage key for task-list and annotate-view filters within one annotation project. */
export function annotationTaskFilterPersistKey(
  annotationProjectId: number | undefined | null,
): string | undefined {
  if (annotationProjectId == null) {
    return undefined;
  }
  return `filters:annotation_tasks:project:${annotationProjectId}`;
}
