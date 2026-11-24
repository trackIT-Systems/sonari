import { useMemo } from "react";
import { type AnnotationTaskFilter } from "@/api/annotation_tasks";
import api from "@/app/api";
import useFilter from "@/hooks/utils/useFilter";
import usePagedQuery from "@/hooks/utils/usePagedQuery";

const emptyFilter: AnnotationTaskFilter = {};

/**
 * The full task index (all ids of a filter) is shared by the task table and the
 * annotate view, so opening a task reuses the table's index instead of running
 * the (on large projects slow) filter again. Edits invalidate it explicitly, so
 * it stays fresh longer than other queries.
 */
export const TASK_INDEX_STALE_MS = 5 * 60 * 1000;

/** Cache key of the full index of a filter; the same as `usePagedQuery` builds for page 0, size -1 */
export function annotationTaskIndexQueryKey(filter: AnnotationTaskFilter) {
  return ["annotation_tasks_index", 0, -1, JSON.stringify(filter)];
}
const _fixed: (keyof AnnotationTaskFilter)[] = [];

export default function useAnnotationTaskIndex({
  filter: initialFilter = emptyFilter,
  fixed = _fixed,
  pageSize = -1,
  enabled = true,
  persistKey,
}: {
  filter?: AnnotationTaskFilter;
  fixed?: (keyof AnnotationTaskFilter)[];
  pageSize?: number;
  enabled?: boolean;
  persistKey?: string;
} = {}) {
  const filter = useFilter<AnnotationTaskFilter>({
    defaults: initialFilter,
    fixed,
    persistKey,
  });

  const { query, pagination, items, total, queryKey } = usePagedQuery({
    name: "annotation_tasks_index",
    queryFn: api.annotationTasks.getIndex,
    pageSize,
    filter: filter.filter,
    enabled,
    staleTime: pageSize === -1 ? TASK_INDEX_STALE_MS : undefined,
  });

  return {
    ...query,
    items,
    filter,
    pagination,
    total,
    queryKey,
  };
}

