import { useQuery } from "@tanstack/react-query";

import api from "@/app/api";

/** Originals and edit history of one task's sound events. Refetched after sound event edits. */
export default function useAnnotationTaskHistory({
  annotationTaskId,
  enabled = true,
}: {
  annotationTaskId: number;
  enabled?: boolean;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["annotation_task_history", annotationTaskId],
    queryFn: () => api.annotationTasks.getHistory(annotationTaskId),
    enabled,
    refetchOnWindowFocus: false,
  });

  return { history: data, isLoading, error } as const;
}
