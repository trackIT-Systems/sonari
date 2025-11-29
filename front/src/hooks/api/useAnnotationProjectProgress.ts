import { useQuery } from "@tanstack/react-query";

import api from "@/app/api";

export default function useAnnotationProjectProgress({
  annotationProjectId,
  enabled = true,
}: {
  annotationProjectId: number;
  enabled?: boolean;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["annotation_project_progress", annotationProjectId],
    queryFn: () => api.annotationProjects.getProgress(annotationProjectId),
    enabled,
  });

  return {
    progress: data,
    isLoading,
    error,
  } as const;
}

