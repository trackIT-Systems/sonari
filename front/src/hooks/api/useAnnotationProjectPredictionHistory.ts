import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import api from "@/app/api";

const POLL_WHILE_RUNNING_MS = 3000;

/**
 * Corrections of predictions in reviewed tasks, from the edit history, and the GUANO
 * backfill that fills in edits made before the history existed. Polls while it runs.
 */
export default function useAnnotationProjectPredictionHistory({
  annotationProjectId,
  enabled = true,
}: {
  annotationProjectId: number;
  enabled?: boolean;
}) {
  const client = useQueryClient();
  const queryKey = ["annotation_project_prediction_history", annotationProjectId];

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => api.annotationProjects.getPredictionHistory(annotationProjectId),
    enabled,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => {
      const backfill = query.state.data?.backfill;
      return backfill?.state === "running" && !backfill.stale ? POLL_WHILE_RUNNING_MS : false;
    },
  });

  const startBackfill = useMutation({
    mutationFn: () => api.annotationProjects.startPredictionBackfill(annotationProjectId),
    onSettled: () => client.invalidateQueries({ queryKey }),
  });

  return { stats: data, isLoading, error, startBackfill } as const;
}
