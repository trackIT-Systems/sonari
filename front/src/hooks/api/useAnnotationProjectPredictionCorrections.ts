import { useQuery } from "@tanstack/react-query";

import api from "@/app/api";

export default function useAnnotationProjectPredictionCorrections({
  annotationProjectId,
  enabled = true,
}: {
  annotationProjectId: number;
  enabled?: boolean;
}) {
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ["annotation_project_prediction_corrections", annotationProjectId],
    queryFn: () => api.annotationProjects.getPredictionCorrections(annotationProjectId),
    enabled,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return {
    corrections: data,
    isLoading,
    isFetching,
    error,
  } as const;
}
