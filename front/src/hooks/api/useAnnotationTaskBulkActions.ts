import { useCallback, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import toast from "react-hot-toast";

import api from "@/app/api";
import type { AnnotationTaskBulkResult } from "@/api/annotation_tasks";
import type { AnnotationTaskFilter } from "@/api/annotation_tasks";
import type { AnnotationStatus, Tag } from "@/types";

const MAX_FAILURE_LINES = 5;

/**
 * Tasks sent per request. Bulk actions have no size limit: the targets are
 * resolved once and then sent in batches, so every request stays short, the
 * progress is visible and the run can be stopped between batches.
 */
export const BULK_REQUEST_SIZE = 500;

export type BulkProgress = {
  /** Tasks handled so far */
  done: number;
  /** Tasks targeted in total (null while the targets are being resolved) */
  total: number | null;
};

function formatBulkFailures(failures: AnnotationTaskBulkResult["failures"]): string {
  const lines = failures.map((f) => `Task ${f.annotation_task_id}: ${f.message}`);
  if (lines.length <= MAX_FAILURE_LINES) {
    return lines.join("\n");
  }
  const head = lines.slice(0, MAX_FAILURE_LINES).join("\n");
  return `${head}\n…and ${lines.length - MAX_FAILURE_LINES} more`;
}

function formatBulkResultSummary(
  result: AnnotationTaskBulkResult,
  soundEventVerb: string = "updated",
): string {
  const parts = [
    `${result.tasks_updated} task(s) updated`,
  ];
  if (result.tasks_skipped > 0) {
    parts.push(`${result.tasks_skipped} skipped`);
  }
  if (result.sound_events_updated > 0) {
    parts.push(`${result.sound_events_updated} sound event(s) ${soundEventVerb}`);
  }
  if (result.sound_events_skipped > 0) {
    parts.push(`${result.sound_events_skipped} sound event(s) skipped (other tags present)`);
  }
  if (result.failures.length > 0) {
    parts.push(`${result.failures.length} failed`);
  }
  return parts.join(", ");
}

function emptyResult(): AnnotationTaskBulkResult {
  return {
    tasks_targeted: 0,
    tasks_updated: 0,
    tasks_skipped: 0,
    sound_events_updated: 0,
    sound_events_skipped: 0,
    failures: [],
  };
}

function addResults(
  a: AnnotationTaskBulkResult,
  b: AnnotationTaskBulkResult,
): AnnotationTaskBulkResult {
  return {
    tasks_targeted: a.tasks_targeted + b.tasks_targeted,
    tasks_updated: a.tasks_updated + b.tasks_updated,
    tasks_skipped: a.tasks_skipped + b.tasks_skipped,
    sound_events_updated: a.sound_events_updated + b.sound_events_updated,
    sound_events_skipped: a.sound_events_skipped + b.sound_events_skipped,
    failures: [...a.failures, ...b.failures],
  };
}

/** Result of a batched run; `stopped` when the user stopped it early. */
type BatchedResult = AnnotationTaskBulkResult & { stopped: boolean };

function invalidateTaskListQueries(client: ReturnType<typeof useQueryClient>) {
  client.invalidateQueries({ queryKey: ["annotation_tasks"] });
  client.invalidateQueries({ queryKey: ["annotation_tasks_index"] });
  client.invalidateQueries({ queryKey: ["annotation_tasks_stats"] });
  client.invalidateQueries({ queryKey: ["annotation_project_species_counts"] });
}

export default function useAnnotationTaskBulkActions({
  filter,
  onError,
}: {
  filter: AnnotationTaskFilter;
  onError?: (error: AxiosError) => void;
}) {
  const client = useQueryClient();
  const [progress, setProgress] = useState<BulkProgress | null>(null);
  const stopRequestedRef = useRef(false);

  /** Ask a running bulk action to stop after the current batch. */
  const stop = useCallback(() => {
    stopRequestedRef.current = true;
  }, []);

  /**
   * Resolve the targets (the ticked ids, or every task matching the filter)
   * and send them in batches of BULK_REQUEST_SIZE.
   */
  const runBatched = useCallback(
    async (
      annotation_task_ids: number[] | undefined,
      send: (batch: number[]) => Promise<AnnotationTaskBulkResult>,
    ): Promise<BatchedResult> => {
      stopRequestedRef.current = false;
      setProgress({ done: 0, total: annotation_task_ids?.length ?? null });
      try {
        const ids = annotation_task_ids
          ?? await api.annotationTasks.bulkResolveIds({ filter });
        setProgress({ done: 0, total: ids.length });

        let total = emptyResult();
        for (let start = 0; start < ids.length; start += BULK_REQUEST_SIZE) {
          if (stopRequestedRef.current) {
            return { ...total, stopped: true };
          }
          const batch = ids.slice(start, start + BULK_REQUEST_SIZE);
          total = addResults(total, await send(batch));
          setProgress({ done: Math.min(start + batch.length, ids.length), total: ids.length });
        }
        return { ...total, stopped: false };
      } finally {
        stopRequestedRef.current = false;
        setProgress(null);
      }
    },
    [filter],
  );

  const handleResult = useCallback(
    (result: BatchedResult, soundEventVerb?: string) => {
      invalidateTaskListQueries(client);
      const summary = formatBulkResultSummary(result, soundEventVerb);
      if (result.stopped) {
        toast(`Stopped: ${summary}`);
      } else {
        toast.success(summary);
      }
      if (result.failures.length > 0) {
        toast.error(formatBulkFailures(result.failures));
      }
    },
    [client],
  );

  const handleError = useCallback(
    (error: AxiosError) => {
      // Batches sent before the error are applied: show them.
      invalidateTaskListQueries(client);
      onError?.(error);
    },
    [client, onError],
  );

  const bulkAddBadge = useMutation<
    BatchedResult,
    AxiosError,
    { annotation_task_ids?: number[]; state: AnnotationStatus }
  >({
    mutationFn: ({ annotation_task_ids, state }) =>
      runBatched(annotation_task_ids, (batch) =>
        api.annotationTasks.bulkAddBadge({ filter, annotation_task_ids: batch, state }),
      ),
    onSuccess: (result) => handleResult(result),
    onError: handleError,
  });

  const bulkRemoveBadge = useMutation<
    BatchedResult,
    AxiosError,
    { annotation_task_ids?: number[]; state: AnnotationStatus }
  >({
    mutationFn: ({ annotation_task_ids, state }) =>
      runBatched(annotation_task_ids, (batch) =>
        api.annotationTasks.bulkRemoveBadge({ filter, annotation_task_ids: batch, state }),
      ),
    onSuccess: (result) => handleResult(result),
    onError: handleError,
  });

  const bulkAddTag = useMutation<
    BatchedResult,
    AxiosError,
    { annotation_task_ids?: number[]; tag: Pick<Tag, "key" | "value"> }
  >({
    mutationFn: ({ annotation_task_ids, tag }) =>
      runBatched(annotation_task_ids, (batch) =>
        api.annotationTasks.bulkAddTag({ filter, annotation_task_ids: batch, tag }),
      ),
    onSuccess: (result) => handleResult(result),
    onError: handleError,
  });

  const bulkReplaceSoundEventTags = useMutation<
    BatchedResult,
    AxiosError,
    {
      annotation_task_ids?: number[];
      old_tag?: Pick<Tag, "key" | "value"> | null;
      new_tag?: Pick<Tag, "key" | "value"> | null;
      replace_all?: boolean;
      add_to_tagged?: boolean;
      replace_group?: string;
    }
  >({
    mutationFn: ({ annotation_task_ids, ...body }) =>
      runBatched(annotation_task_ids, (batch) =>
        api.annotationTasks.bulkReplaceSoundEventTags({
          filter,
          annotation_task_ids: batch,
          ...body,
        }),
      ),
    onSuccess: (result) => handleResult(result),
    onError: handleError,
  });

  const bulkDeleteSoundEventsByTag = useMutation<
    BatchedResult,
    AxiosError,
    { annotation_task_ids?: number[]; tag: Pick<Tag, "key" | "value"> }
  >({
    mutationFn: ({ annotation_task_ids, tag }) =>
      runBatched(annotation_task_ids, (batch) =>
        api.annotationTasks.bulkDeleteSoundEventsByTag({
          filter,
          annotation_task_ids: batch,
          tag,
        }),
      ),
    onSuccess: (result) => handleResult(result, "deleted"),
    onError: handleError,
  });

  return {
    bulkAddBadge,
    bulkRemoveBadge,
    bulkAddTag,
    bulkReplaceSoundEventTags,
    bulkDeleteSoundEventsByTag,
    progress,
    stop,
  };
}
