import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import toast from "react-hot-toast";

import api from "@/app/api";
import type { AnnotationTaskBulkResult } from "@/api/annotation_tasks";
import type { AnnotationTaskFilter } from "@/api/annotation_tasks";
import type { AnnotationStatus, Tag } from "@/types";

const MAX_FAILURE_LINES = 5;

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
  if (result.failures.length > 0) {
    parts.push(`${result.failures.length} failed`);
  }
  return parts.join(", ");
}

function invalidateTaskListQueries(client: ReturnType<typeof useQueryClient>) {
  client.invalidateQueries({ queryKey: ["annotation_tasks"] });
  client.invalidateQueries({ queryKey: ["annotation_tasks_index"] });
  client.invalidateQueries({ queryKey: ["annotation_tasks_stats"] });
}

export default function useAnnotationTaskBulkActions({
  filter,
  onError,
}: {
  filter: AnnotationTaskFilter;
  onError?: (error: AxiosError) => void;
}) {
  const client = useQueryClient();

  const bulkAddBadge = useMutation({
    mutationFn: ({
      annotation_task_ids,
      state,
    }: {
      annotation_task_ids?: number[];
      state: AnnotationStatus;
    }) =>
      api.annotationTasks.bulkAddBadge({
        filter,
        annotation_task_ids,
        state,
      }),
    onSuccess: (result) => {
      invalidateTaskListQueries(client);
      toast.success(formatBulkResultSummary(result));
      if (result.failures.length > 0) {
        toast.error(formatBulkFailures(result.failures));
      }
    },
    onError,
  });

  const bulkReplaceSoundEventTags = useMutation({
    mutationFn: ({
      annotation_task_ids,
      old_tag,
      new_tag,
      replace_all,
      add_to_tagged,
    }: {
      annotation_task_ids?: number[];
      old_tag?: Pick<Tag, "key" | "value"> | null;
      new_tag?: Pick<Tag, "key" | "value"> | null;
      replace_all?: boolean;
      add_to_tagged?: boolean;
    }) =>
      api.annotationTasks.bulkReplaceSoundEventTags({
        filter,
        annotation_task_ids,
        old_tag,
        new_tag,
        replace_all,
        add_to_tagged,
      }),
    onSuccess: (result) => {
      invalidateTaskListQueries(client);
      toast.success(formatBulkResultSummary(result));
      if (result.failures.length > 0) {
        toast.error(formatBulkFailures(result.failures));
      }
    },
    onError,
  });

  const bulkDeleteSoundEventsByTag = useMutation({
    mutationFn: ({
      annotation_task_ids,
      tag,
    }: {
      annotation_task_ids?: number[];
      tag: Pick<Tag, "key" | "value">;
    }) =>
      api.annotationTasks.bulkDeleteSoundEventsByTag({
        filter,
        annotation_task_ids,
        tag,
      }),
    onSuccess: (result) => {
      invalidateTaskListQueries(client);
      toast.success(formatBulkResultSummary(result, "deleted"));
      if (result.failures.length > 0) {
        toast.error(formatBulkFailures(result.failures));
      }
    },
    onError,
  });

  return {
    bulkAddBadge,
    bulkReplaceSoundEventTags,
    bulkDeleteSoundEventsByTag,
  };
}
