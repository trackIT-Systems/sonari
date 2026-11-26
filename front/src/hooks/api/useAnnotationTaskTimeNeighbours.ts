import { keepPreviousData, useQuery } from "@tanstack/react-query";

import api from "@/app/api";

/** How many tasks are fetched on each side; the strip keeps those close enough in time */
export const TIME_NEIGHBOURS = 10;

/** The project's tasks just before and after a task in time, ignoring the filter */
export default function useAnnotationTaskTimeNeighbours({
  annotationTaskId,
  enabled = true,
}: {
  annotationTaskId: number | undefined;
  enabled?: boolean;
}) {
  const { data, isLoading, isPlaceholderData, error } = useQuery({
    queryKey: ["annotation_task_time_neighbours", annotationTaskId, TIME_NEIGHBOURS],
    queryFn: ({ signal }) =>
      api.annotationTasks.getTimeNeighbours(
        annotationTaskId!,
        { before: TIME_NEIGHBOURS, after: TIME_NEIGHBOURS },
        signal,
      ),
    enabled: enabled && annotationTaskId != null,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

    /** `isStale`: the neighbours shown are the previous task's, while this task's load */
  return { neighbours: data, isLoading, isStale: isPlaceholderData, error } as const;
}
