import { useMutation } from "@tanstack/react-query";
import { useMemo } from "react";

import { type TagCreate, type TagFilter } from "@/api/tags";
import api from "@/app/api";
import useFilter from "@/hooks/utils/useFilter";
import usePagedQuery from "@/hooks/utils/usePagedQuery";

const _empty: TagFilter = {};
const _fixed: (keyof TagFilter)[] = [];

export default function useTags({
  filter: initialFilter = _empty,
  fixed = _fixed,
  pageSize = 10,
  enabled = true,
  annotationProjectId,
  scoped = true,
}: {
  filter?: TagFilter;
  fixed?: (keyof TagFilter)[];
  pageSize?: number;
  enabled?: boolean;
  /** Project whose tag group or preset is used; new tags join its group. */
  annotationProjectId?: number | null;
  /** If false, search all tags even inside a project. */
  scoped?: boolean;
} = {}) {
  const filter = useFilter<TagFilter>({
    defaults: initialFilter,
    fixed: fixed,
    debounce: 50, // Lower debounce time for faster response
    persistKey: "filters:tags",
  });

  // The project scope is kept out of the persisted filter so it does not
  // leak into tag searches outside the project.
  const queryFilter = useMemo<TagFilter>(
    () =>
      annotationProjectId != null && scoped
        ? { ...filter.filter, annotation_project_id: annotationProjectId }
        : filter.filter,
    [filter.filter, annotationProjectId, scoped],
  );

  const { items, total, query, pagination } = usePagedQuery({
    name: "tags",
    queryFn: api.tags.get,
    pageSize: pageSize,
    filter: queryFilter,
    enabled: enabled,
  });

  const create = useMutation({
    mutationFn: (data: TagCreate) =>
      api.tags.create(data, {
        annotationProjectId: annotationProjectId ?? undefined,
      }),
    onSuccess: () => {
      query.refetch();
    },
  });

  return {
    ...query,
    items,
    total,
    pagination,
    filter,
    create,
  };
}
