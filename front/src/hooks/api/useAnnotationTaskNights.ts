import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";

import type { AnnotationTaskFilter } from "@/api/annotation_tasks";
import api from "@/app/api";
import { TABLE_LIST_INCLUDES } from "@/hooks/api/useAnnotationTasks";

import type { Pagination } from "@/hooks/utils/usePagedQuery";
import type { AnnotationTask, AnnotationTaskNightTotal, AnnotationTaskStats } from "@/types";

/** Key of the night of recordings without a date */
export const NO_RECORDING_NIGHT = "none";

/**
 * Filter keys that only narrow the recordings (project, station, date range):
 * cheap, so the nights are listed under them alone. The rest of the filter is
 * applied per night, to the nights on the page only (see `getNightStats`).
 */
const SCOPE_KEYS = ["annotation_project", "dataset", "date_range"] as const;

/** The part of a filter the nights are listed by */
export function scopeOfFilter(filter: AnnotationTaskFilter): AnnotationTaskFilter {
  const scope: Record<string, unknown> = {};
  for (const key of SCOPE_KEYS) {
    if (filter[key] !== undefined) scope[key] = filter[key];
  }
  return scope as AnnotationTaskFilter;
}

/** Whether the filter narrows the tasks beyond its scope, so not every task of a night matches */
export function narrowsBeyondScope(filter: AnnotationTaskFilter): boolean {
  return Object.entries(filter).some(
    ([key, value]) =>
      value !== undefined && key !== "sort_by" && !(SCOPE_KEYS as readonly string[]).includes(key),
  );
}

/** Nights listed per page of the task table */
export const NIGHTS_PER_PAGE = 50;

/**
 * Tasks of an expanded night loaded (and shown) at a time. A night can hold
 * thousands of tasks; rendering them all at once freezes the page.
 */
export const NIGHT_TASKS_PER_PAGE = 100;

type NightPageResult = { data: { items: AnnotationTask[]; total: number } | undefined; isError: boolean };

/** Keeps only what the table needs; module-level so useQueries can reuse its result between renders */
function combineNightPages(results: { data?: { items: AnnotationTask[]; total: number }; isError: boolean }[]): NightPageResult[] {
  return results.map((result) => ({ data: result.data, isError: result.isError }));
}

/** The browser's UTC offset in minutes (e.g. 120 for CEST) */
export function currentUtcOffset(): number {
  return -new Date().getTimezoneOffset();
}

export function nightKey(night: string | null): string {
  return night ?? NO_RECORDING_NIGHT;
}

/**
 * The night (noon to noon local time) a recording was made in, as the date of
 * its evening ("YYYY-MM-DD"), or null without a date. Matches the server's
 * grouping: the recording time (UTC, midnight without a time) shifted by the
 * UTC offset minus 12 hours, then its date.
 */
export function nightOfRecording(
  recording: { date?: Date | string | null; time?: string | null } | null | undefined,
  utcOffset: number,
): string | null {
  const raw = recording?.date;
  if (raw == null) return null;
  // A "YYYY-MM-DD" date (or the Date it parses to) is UTC midnight
  const date = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  let seconds = 0;
  if (recording?.time) {
    const [h, m, s] = recording.time.split(":").map(Number);
    seconds = h * 3600 + m * 60 + (s || 0);
  }
  // The date is parsed as UTC midnight ("YYYY-MM-DD")
  const shifted = date.getTime() + (seconds + (utcOffset - 12 * 60) * 60) * 1000;
  return new Date(shifted).toISOString().slice(0, 10);
}

export type NightGroup = AnnotationTaskNightTotal & {
  key: string;
  /**
   * Status counts of the night's tasks matching the whole filter; null while
   * counting. `total` above counts all the night's tasks in the filter's scope.
   */
  stats: AnnotationTaskStats | null;
  /** Number of tasks matching the whole filter, once known */
  matching: number | null;
  /** Counted, and no task matches the filter: nothing to expand */
  empty: boolean;
  expanded: boolean;
  /** The night's tasks loaded so far, once expanded (NIGHT_TASKS_PER_PAGE at a time) */
  tasks: AnnotationTask[];
  isLoadingTasks: boolean;
  /** Some of the night's tasks are not loaded yet (see `loadMore`) */
  hasMore: boolean;
  /** Index of the night's first task in `items` (expanded nights only) */
  start: number;
};

/**
 * The task table grouped by night (noon to noon local time), all collapsed at
 * first. Lazy on large projects:
 * - the nights are listed under the filter's scope only (project, station,
 *   date range), which needs no costly filter;
 * - the whole filter runs per night: status counts for the nights on the page
 *   in one request, a night's tasks when it is expanded.
 * `items` holds the tasks of the expanded nights in order, as the table's
 * rows. An expanded night loads NIGHT_TASKS_PER_PAGE tasks at a time;
 * `loadMore` adds the next ones.
 */
export default function useAnnotationTaskNights({
  filter,
  enabled,
}: {
  filter: AnnotationTaskFilter;
  enabled: boolean;
}) {
  const client = useQueryClient();
  const [utcOffset] = useState(currentUtcOffset);
  const [page, setPageState] = useState(0);
  const [pageSize, setPageSizeState] = useState(NIGHTS_PER_PAGE);
  const [expanded, setExpandedKeys] = useState<ReadonlySet<string>>(() => new Set());
  /** Pages of tasks loaded per expanded night (one when not listed) */
  const [pagesLoaded, setPagesLoaded] = useState<ReadonlyMap<string, number>>(() => new Map());

  const filterKey = JSON.stringify(filter);
  const scope = useMemo(() => scopeOfFilter(filter), [filter]);
  const scopeKey = JSON.stringify(scope);
  // A new filter collapses every night; a new scope lists other nights, from the first page
  useEffect(() => {
    setExpandedKeys(new Set());
    setPagesLoaded(new Map());
  }, [filterKey]);
  useEffect(() => {
    setPageState(0);
  }, [scopeKey]);

  // Not under "annotation_tasks_nights": no edit of a task changes the nights of its scope
  const nightsQuery = useQuery({
    queryKey: ["annotation_tasks_night_list", scopeKey, utcOffset, page, pageSize],
    queryFn: ({ signal }) =>
      api.annotationTasks.getNights(scope, { utcOffset, limit: pageSize, offset: page * pageSize }, signal),
    enabled,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  });

  const nights = useMemo(() => nightsQuery.data?.items ?? [], [nightsQuery.data]);
  const pageNightKeys = useMemo(() => nights.map((night) => nightKey(night.night)), [nights]);

  // The whole filter, counted for the nights on the page only. Status edits
  // refresh it (see invalidateAnnotationTaskQueries). No placeholder: counts
  // of another filter or page would mislead.
  const statsQuery = useQuery({
    queryKey: ["annotation_tasks_nights", "stats", filterKey, utcOffset, pageNightKeys],
    queryFn: ({ signal }) =>
      api.annotationTasks.getNightStats(filter, { nights: pageNightKeys, utcOffset }, signal),
    enabled: enabled && !nightsQuery.isPlaceholderData && pageNightKeys.length > 0,
    refetchOnWindowFocus: false,
  });
  const statsByNight = useMemo(
    () => new Map((statsQuery.data ?? []).map((stats) => [nightKey(stats.night), stats])),
    [statsQuery.data],
  );

  const nightFilter = useCallback(
    (key: string): AnnotationTaskFilter => ({
      ...TABLE_LIST_INCLUDES,
      ...filter,
      recording_night: { night: key, utc_offset: utcOffset },
    }),
    [filter, utcOffset],
  );

  const expandedNights = useMemo(
    () => nights.filter((night) => expanded.has(nightKey(night.night))),
    [nights, expanded],
  );

  // One query per loaded page of each expanded night, in order
  const pageQueries = useMemo(
    () =>
      expandedNights.flatMap((night) => {
        const key = nightKey(night.night);
        const query = nightFilter(key);
        const queryJson = JSON.stringify(query);
        return Array.from({ length: pagesLoaded.get(key) ?? 1 }, (_, page) => ({
          // Under "annotation_tasks", so task edits refresh it like the task list
          queryKey: ["annotation_tasks", "night", queryJson, page],
          queryFn: () =>
            api.annotationTasks.getMany({
              ...query,
              limit: NIGHT_TASKS_PER_PAGE,
              offset: page * NIGHT_TASKS_PER_PAGE,
            }),
          enabled,
          refetchOnWindowFocus: false,
        }));
      }),
    [expandedNights, nightFilter, pagesLoaded, enabled],
  );
  const pageResults = useQueries({ queries: pageQueries, combine: combineNightPages });

  const { groups, items } = useMemo(() => {
    const items: AnnotationTask[] = [];
    const groups: NightGroup[] = [];
    let resultIndex = 0;
    for (const night of nights) {
      const key = nightKey(night.night);
      const isExpanded = expanded.has(key);
      const tasks: AnnotationTask[] = [];
      let isLoadingTasks = false;
      let hasMore = false;
      const stats = statsByNight.get(key) ?? null;
      let matching = stats?.total ?? null;
      if (isExpanded) {
        const pages = pagesLoaded.get(key) ?? 1;
        let total = matching ?? night.total;
        for (let page = 0; page < pages; page += 1) {
          const result = pageResults[resultIndex];
          resultIndex += 1;
          if (result?.data) {
            tasks.push(...result.data.items);
            total = result.data.total;
            matching = total;
          } else if (!result?.isError) {
            isLoadingTasks = true;
          }
        }
        hasMore = !isLoadingTasks && tasks.length < total;
      }
      groups.push({
        ...night,
        key,
        stats,
        matching,
        empty: matching === 0,
        expanded: isExpanded,
        tasks,
        isLoadingTasks,
        hasMore,
        start: items.length,
      });
      items.push(...tasks);
    }
    return { groups, items };
  }, [nights, statsByNight, expanded, pagesLoaded, pageResults]);

  const emptyKeysRef = useRef(new Set<string>());
  emptyKeysRef.current = new Set(groups.filter((group) => group.empty).map((group) => group.key));

  const setExpanded = useCallback((key: string, open: boolean) => {
    // Nothing matches in an empty night: no tasks to load
    if (open && emptyKeysRef.current.has(key)) return;
    setExpandedKeys((prev) => {
      if (prev.has(key) === open) return prev;
      const next = new Set(prev);
      if (open) next.add(key);
      else next.delete(key);
      return next;
    });
    // A collapsed night opens again with its first page only
    if (!open) {
      setPagesLoaded((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
    }
  }, []);

  /** Load the next NIGHT_TASKS_PER_PAGE tasks of an expanded night */
  const loadMore = useCallback((key: string) => {
    setPagesLoaded((prev) => new Map(prev).set(key, (prev.get(key) ?? 1) + 1));
  }, []);

  /** Ids of every task of a night under the current filter (for ticking it collapsed) */
  const fetchNightTaskIds = useCallback(
    (key: string): Promise<number[]> => {
      const query = { ...filter, recording_night: { night: key, utc_offset: utcOffset } };
      return client.fetchQuery({
        queryKey: ["annotation_tasks_index", "night", JSON.stringify(query)],
        queryFn: async () =>
          (await api.annotationTasks.getIndex({ ...query, limit: -1, offset: 0 })).items.map((task) => task.id),
        staleTime: 30_000,
      });
    },
    [client, filter, utcOffset],
  );

  const total = nightsQuery.data?.total ?? 0;
  const numPages = Math.ceil(total / pageSize);
  const pagination: Pagination = useMemo(
    () => ({
      page,
      numPages,
      pageSize,
      hasNextPage: page < numPages - 1,
      hasPrevPage: page > 0,
      nextPage: () => setPageState((current) => Math.min(Math.max(0, numPages - 1), current + 1)),
      prevPage: () => setPageState((current) => Math.max(0, current - 1)),
      setPage: (next: number) => {
        if (next >= 0 && next < numPages) setPageState(next);
      },
      setPageSize: (size: number) => {
        if (size > 0) {
          setPageSizeState(size);
          setPageState(0);
        }
      },
    }),
    [page, numPages, pageSize],
  );

  return {
    groups,
    items,
    utcOffset,
    setExpanded,
    loadMore,
    fetchNightTaskIds,
    pagination,
    /** Number of nights in the filter's scope */
    total,
    /** Whether the filter narrows the nights' tasks, so a night counts its matching tasks apart */
    narrowed: narrowsBeyondScope(filter),
    isLoading: nightsQuery.isLoading,
    isFetching: nightsQuery.isFetching,
    isPlaceholderData: nightsQuery.isPlaceholderData,
    data: nightsQuery.data,
  };
}
