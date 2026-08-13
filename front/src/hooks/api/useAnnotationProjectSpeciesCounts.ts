import { useQuery } from "@tanstack/react-query";

import api from "@/app/api";

export default function useAnnotationProjectSpeciesCounts({
  annotationProjectId,
  enabled = true,
}: {
  annotationProjectId: number;
  enabled?: boolean;
}) {
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ["annotation_project_species_counts", annotationProjectId],
    queryFn: () => api.annotationProjects.getSpeciesCounts(annotationProjectId),
    enabled,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData,
  });

  return {
    speciesCounts: data ?? [],
    isLoading,
    isFetching,
    error,
  } as const;
}
