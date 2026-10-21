/** Whether navigation should jump to the first filtered task after the index loads. */
export type ReconcileAnnotationTaskAction = "none" | "go_to_first";

/**
 * After the filtered task index updates, decide if the open task should change.
 * Empty filter results keep the current task on screen, and so does an edit
 * that filters the open task out (`wasListed`): the user may still want to
 * set its status before moving on.
 */
export function reconcileAnnotationTaskIndex({
  currentTaskId,
  itemIds,
  isLoading,
  wasListed = false,
}: {
  currentTaskId: number | null | undefined;
  itemIds: number[];
  isLoading: boolean;
  /** The open task was in the index under the same filter */
  wasListed?: boolean;
}): ReconcileAnnotationTaskAction {
  if (isLoading) {
    return "none";
  }
  if (itemIds.length === 0) {
    return "none";
  }
  if (currentTaskId == null) {
    return "go_to_first";
  }
  if (!itemIds.includes(currentTaskId)) {
    return wasListed ? "none" : "go_to_first";
  }
  return "none";
}
