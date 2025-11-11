import { useMemo } from "react";
import { type AnnotationTaskFilter } from "@/api/annotation_tasks";
import api from "@/app/api";
import useFilter from "@/hooks/utils/useFilter";
import usePagedQuery from "@/hooks/utils/usePagedQuery";

const emptyFilter: AnnotationTaskFilter = {};
const _fixed: (keyof AnnotationTaskFilter)[] = [];

export default function useAnnotationTasks({
  filter: initialFilter = emptyFilter,
  fixed = _fixed,
  pageSize = 100,
  enabled = true,
}: {
  filter?: AnnotationTaskFilter;
  fixed?: (keyof AnnotationTaskFilter)[];
  pageSize?: number;
  enabled?: boolean;
} = {}) {
  const filter = useFilter<AnnotationTaskFilter>({
    defaults: initialFilter,
    fixed
  });

  // Always include recording and status badge data in the filter
  const filterWithDefaults = useMemo(() => ({
    ...filter.filter,
    include_recording: true,
    include_sound_event_tags: true,
    include_tags: true,
    include_notes: true,
    include_status_badges: true,
    include_status_badge_users: true,
  }), [filter.filter]);

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
