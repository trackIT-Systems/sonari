import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

/** Task queries whose results change once more calls have levels. */
const TASK_QUERY_NAMES = ["annotation_tasks", "annotation_tasks_index", "annotation_tasks_stats"];

/**
 * Refresh the task list when a call level run ends while the page is open, even one
 * too short to be seen running. `loaded` is false until the run's status has loaded.
 */
export default function useRefreshTasksWhenRunFinishes({
  loaded,
  finishedOn,
}: {
  loaded: boolean;
  finishedOn: Date | null | undefined;
}) {
  const client = useQueryClient();
  const finished = finishedOn?.getTime() ?? null;
  const seen = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    if (!loaded) return;
    if (seen.current !== undefined && finished !== null && finished !== seen.current) {
      for (const name of TASK_QUERY_NAMES) {
        client.invalidateQueries({ queryKey: [name] });
      }
    }
    seen.current = finished;
  }, [loaded, finished, client]);
}
