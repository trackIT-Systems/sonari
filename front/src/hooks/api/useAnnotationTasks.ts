import { useMemo } from "react";
import { type AnnotationTaskFilter } from "@/api/annotation_tasks";
import api from "@/app/api";
import useFilter from "@/hooks/utils/useFilter";
import usePagedQuery from "@/hooks/utils/usePagedQuery";

const emptyFilter: AnnotationTaskFilter = {};
const _fixed: (keyof AnnotationTaskFilter)[] = [];

const FULL_LIST_INCLUDES = {
  include_recording: true,
  include_sound_event_annotations: true,
  include_sound_event_tags: true,
  include_tags: true,
  include_notes: true,
  include_status_badges: true,
  include_status_badge_users: true,
} as const;

const TABLE_LIST_INCLUDES = {
  include_recording: true,
  include_sound_event_annotations: false,
  include_sound_event_tags: true,
  include_tags: true,
  include_notes: true,
  include_status_badges: true,
  include_status_badge_users: true,
} as const;

export default function useAnnotationTasks({
  filter: initialFilter = emptyFilter,
  fixed = _fixed,
  pageSize = 100,
  enabled = true,
  persistKey,
  listView = false,
}: {
  filter?: AnnotationTaskFilter;
  fixed?: (keyof AnnotationTaskFilter)[];
  pageSize?: number;
  enabled?: boolean;
  /** When set, filter state is restored across navigations (e.g. task list ↔ annotate). */
  persistKey?: string;
  /** Lighter payload for the task table (aggregated sound event tags only). */
  listView?: boolean;
} = {}) {
  const filter = useFilter<AnnotationTaskFilter>({
    defaults: initialFilter,
    fixed,
    persistKey,
  });

  // Apply defaults only if not explicitly set in the filter
  const filterWithDefaults = useMemo(() => ({
    ...(listView ? TABLE_LIST_INCLUDES : FULL_LIST_INCLUDES),
    ...filter.filter,
  }), [filter.filter, listView]);

  const { query, pagination, items, total, queryKey } = usePagedQuery({
    name: "annotation_tasks",
    queryFn: api.annotationTasks.getMany,
    pageSize,
    filter: filterWithDefaults,
    enabled,
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
