import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import api from "@/app/api";
import { getAnnotateViewImageRequests } from "@/components/annotation_tasks/annotateViewImages";
import { prefetchImages } from "@/utils/spectrogram_images";

import type { SpectrogramParameters } from "@/types";

/** A task's times and recording do not change while annotating */
const TASK_STALE_MS = 10 * 60 * 1000;

/**
 * Preloads the annotate view of the upcoming tasks: once the current task's
 * visible spectrogram has loaded (call the returned `onCurrentTaskLoaded`), the
 * images each upcoming task opens with are prefetched, the next task first.
 * They go through the shared image cache and background queue (see
 * `spectrogram_images`), so opening the next task shows them at once.
 *
 * Moving to another task drops the prefetches still waiting; one already
 * requested finishes, and the view joins it if it needs that image.
 */
export default function usePreloadUpcomingTasks({
  currentTaskId,
  upcomingTaskIds,
  parameters,
  enabled,
}: {
  currentTaskId: number | null;
  /** In the order they come up */
  upcomingTaskIds: number[];
  /** The saved spectrogram parameters, which a newly opened task uses */
  parameters: SpectrogramParameters;
  /** Off while the spectrogram is hidden */
  enabled: boolean;
}): () => void {
  const client = useQueryClient();
  const [loadedTaskId, setLoadedTaskId] = useState<number | null>(null);
  const onCurrentTaskLoaded = useCallback(
    () => setLoadedTaskId(currentTaskId),
    [currentTaskId],
  );

  const idsKey = upcomingTaskIds.join(",");

  useEffect(() => {
    if (!enabled || currentTaskId == null || loadedTaskId !== currentTaskId) return;
    const ids = idsKey === "" ? [] : idsKey.split(",").map(Number);
    if (ids.length === 0) return;

    const controller = new AbortController();
    (async () => {
      for (const id of ids) {
        try {
          // Only the times and the recording are needed to know the images
          const task = await client.fetchQuery({
            queryKey: ["annotation_task_recording", id],
            queryFn: () => api.annotationTasks.get(id, { recording: true }),
            staleTime: TASK_STALE_MS,
          });
          if (controller.signal.aborted) return;
          if (task.recording == null) continue;
          prefetchImages(
            getAnnotateViewImageRequests({ ...task, recording: task.recording }, parameters),
            controller.signal,
          );
        } catch (error) {
          if (controller.signal.aborted) return;
          console.warn(`Failed to preload annotation task ${id}:`, error);
        }
      }
    })();
    return () => controller.abort();
  }, [enabled, currentTaskId, loadedTaskId, idsKey, parameters, client]);

  return onCurrentTaskLoaded;
}
