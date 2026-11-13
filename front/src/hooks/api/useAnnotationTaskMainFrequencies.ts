import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import api from "@/app/api";

import type { SoundEventAnnotation } from "@/types";

/**
 * Main frequency of each sound event of a task, by id. The query key holds
 * the sound events' geometries, so adding, deleting or moving one measures
 * again; tag edits do not.
 */
export default function useAnnotationTaskMainFrequencies({
  annotationTaskId,
  soundEventAnnotations,
  enabled = true,
}: {
  annotationTaskId: number;
  soundEventAnnotations: SoundEventAnnotation[];
  enabled?: boolean;
}) {
  const geometries = useMemo(
    () =>
      JSON.stringify(
        soundEventAnnotations
          .map((sea) => [sea.id, sea.geometry.coordinates] as const)
          .sort(([a], [b]) => a - b),
      ),
    [soundEventAnnotations],
  );

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["annotation_task_main_frequencies", annotationTaskId, geometries],
    queryFn: ({ signal }) => api.annotationTasks.getMainFrequencies(annotationTaskId, signal),
    enabled,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
    // Keep the previous values of this task while one sound event is measured again
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === annotationTaskId ? previous : undefined,
  });

  const frequencies = useMemo(
    () => new Map((data ?? []).map((entry) => [entry.sound_event_annotation_id, entry.main_frequency])),
    [data],
  );

  return { frequencies, isLoading, isFetching, error } as const;
}
