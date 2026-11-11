import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import api from "@/app/api";
import useRefreshTasksWhenRunFinishes from "@/hooks/api/useRefreshTasksWhenRunFinishes";

const POLL_WHILE_RUNNING_MS = 3000;

/**
 * Reference calls of a species in a project and the search for them. While a search
 * (or any run measuring the species) is going, polls, so references appear as found.
 */
export default function useReferenceCalls({
  annotationProjectId,
  tag,
  limit,
}: {
  annotationProjectId: number;
  tag: { key: string; value: string } | undefined;
  limit?: number;
}) {
  const client = useQueryClient();
  const queryKey = ["reference_calls", annotationProjectId, tag?.key, tag?.value, limit];

  const query = useQuery({
    queryKey,
    queryFn: () => api.annotationProjects.getReferenceCalls(annotationProjectId, tag!, limit),
    enabled: tag != null,
    refetchOnWindowFocus: false,
    placeholderData: (previous, previousQuery) =>
      // Keep showing the calls while polling, not those of another species
      previousQuery?.queryKey[3] === tag?.value ? previous : undefined,
    refetchInterval: (q) => {
      const job = q.state.data?.job;
      return job?.state === "running" && !job.stale ? POLL_WHILE_RUNNING_MS : false;
    },
  });

  const job = query.data?.job;
  const running = job?.state === "running" && !job.stale;
  useRefreshTasksWhenRunFinishes({ loaded: query.data !== undefined, finishedOn: job?.finished_on });

  const find = useMutation({
    mutationFn: () => api.annotationProjects.startReferenceCalls(annotationProjectId, tag!),
    onSuccess: (data) => client.setQueryData(queryKey, data),
    onSettled: () => client.invalidateQueries({ queryKey }),
  });

  return { references: query.data, isLoading: query.isLoading, error: query.error, running, find } as const;
}
