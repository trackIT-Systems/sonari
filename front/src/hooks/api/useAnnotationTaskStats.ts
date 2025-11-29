import { useQuery } from "@tanstack/react-query";
import { type AnnotationTaskFilter } from "@/api/annotation_tasks";
import { type AnnotationTaskStats } from "@/types";
import api from "@/app/api";

export default function useAnnotationTaskStats({
  filter = {},
  enabled = true,
}: {
  filter?: AnnotationTaskFilter;
  enabled?: boolean;
} = {}) {
  const queryKey = ["annotation_tasks_stats", JSON.stringify(filter)];
  
  const query = useQuery<AnnotationTaskStats, Error>({
    queryKey,
    queryFn: () => api.annotationTasks.getStats(filter),
    enabled,
    refetchOnWindowFocus: false,
  });

  return { ...query, stats: query.data };
}

