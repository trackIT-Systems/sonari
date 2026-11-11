import type { QueryClient, QueryKey } from "@tanstack/react-query";

/** What an edit of a single annotation task changed */
export type AnnotationTaskChange = "status" | "task_tag" | "note" | "sound_event";

type FilterValues = Record<string, unknown>;

/** Filter keys whose matching tasks can change after an edit of that kind */
const FILTER_KEYS_BY_CHANGE: Record<AnnotationTaskChange, readonly string[]> = {
  status: ["pending", "assigned", "verified", "rejected", "completed", "assigned_to"],
  task_tag: ["annotation_task_tag", "task_tag", "task_tag_include_match", "task_tag_count"],
  note: [],
  sound_event: [
    "sound_event_annotation_tag",
    "sound_event_annotation_tag_include_match",
    "sound_event_annotation_tag_count",
    "sound_event_annotation_count",
    "empty",
    "confidence",
    "median_confidence",
    "sound_event_annotation_min_frequency",
    "sound_event_annotation_max_frequency",
  ],
};

/** Include flags whose loaded data changes after an edit of that kind */
const INCLUDE_KEYS_BY_CHANGE: Record<AnnotationTaskChange, readonly string[]> = {
  status: ["include_status_badges", "include_status_badge_users"],
  task_tag: ["include_tags"],
  note: ["include_notes", "include_note_users"],
  sound_event: [
    "include_sound_event_annotations",
    "include_sound_event_tags",
    "include_sound_event_annotation_features",
    "include_sound_event_annotation_users",
  ],
};

/** Filter keys and include flags that no edit of a single task can affect */
const STATIC_KEYS: readonly string[] = [
  "include_recording",
  "include_annotation_project",
  "include_features",
  "annotation_project",
  "dataset",
  "date_range",
  "night",
  "day",
  "sample",
  "recording",
  "search_recordings",
  "annotation_task_ids",
  "sort_by",
];

const CHANGES = Object.keys(FILTER_KEYS_BY_CHANGE) as AnnotationTaskChange[];

const KNOWN_KEYS = new Set<string>([
  ...STATIC_KEYS,
  ...CHANGES.flatMap((change) => FILTER_KEYS_BY_CHANGE[change]),
  ...CHANGES.flatMap((change) => INCLUDE_KEYS_BY_CHANGE[change]),
]);

function isFilterValues(value: unknown): value is FilterValues {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Find the filter in a task query key. Paged queries store it as a JSON
 * string ([name, page, size, filter]), others as the object itself.
 */
export function filterFromQueryKey(queryKey: QueryKey): FilterValues | null {
  for (const part of queryKey.slice(1)) {
    if (isFilterValues(part)) {
      return part;
    }
    if (typeof part === "string") {
      try {
        const parsed: unknown = JSON.parse(part);
        if (isFilterValues(parsed)) {
          return parsed;
        }
      } catch {
        // Not a serialized filter
      }
    }
  }
  return null;
}

/**
 * Whether a query with this filter can return different data after the
 * change. Unknown filter keys count as affected, so a filter added later
 * never shows stale results.
 */
export function filterAffectedByChange(
  filter: FilterValues | null,
  change: AnnotationTaskChange,
): boolean {
  if (filter == null) {
    return true;
  }
  return Object.entries(filter).some(([key, value]) => {
    if (value == null) {
      return false;
    }
    if (FILTER_KEYS_BY_CHANGE[change].includes(key)) {
      return true;
    }
    if (INCLUDE_KEYS_BY_CHANGE[change].includes(key)) {
      return value === true;
    }
    return !KNOWN_KEYS.has(key);
  });
}

/**
 * Invalidate the task lists, index and stats after an edit of a single
 * task, but only those whose results the edit can change. Refetching the
 * whole index and stats after every tag or sound event is expensive on
 * large projects.
 */
export function invalidateAnnotationTaskQueries(
  client: QueryClient,
  change: AnnotationTaskChange,
) {
  const affected = (queryKey: QueryKey) =>
    filterAffectedByChange(filterFromQueryKey(queryKey), change);

  client.invalidateQueries({
    queryKey: ["annotation_tasks"],
    predicate: (query) => affected(query.queryKey),
  });
  client.invalidateQueries({
    queryKey: ["annotation_tasks_index"],
    predicate: (query) => affected(query.queryKey),
  });
  // Stats count tasks by status, so every status edit changes them
  client.invalidateQueries({
    queryKey: ["annotation_tasks_stats"],
    predicate: (query) => change === "status" || affected(query.queryKey),
  });
  // Only refetched while the history panel is open.
  if (change === "sound_event") {
    client.invalidateQueries({ queryKey: ["annotation_task_history"] });
  }
}

/** Quiet time after the last edit before the lists, index and stats are refetched */
export const DEFERRED_INVALIDATION_MS = 2000;

type PendingInvalidation = { timer: ReturnType<typeof setTimeout>; changes: Set<AnnotationTaskChange> };
const pendingInvalidations = new WeakMap<QueryClient, PendingInvalidation>();

/**
 * Like `invalidateAnnotationTaskQueries`, but once the edits pause: for edits
 * that come in fast, such as badges set while tabbing through tasks. Each
 * edit still saves at once; only the refetch of the affected task lists,
 * index and stats waits until no edit came for `DEFERRED_INVALIDATION_MS`.
 * Twenty quick badges then cause one refetch instead of twenty full ones
 * that pile up on the server.
 *
 * A refetch already running when another edit comes is cancelled: its result
 * is outdated, and the next one follows after the pause.
 */
export function scheduleAnnotationTaskQueriesInvalidation(
  client: QueryClient,
  change: AnnotationTaskChange,
) {
  const pending = pendingInvalidations.get(client);
  if (pending) clearTimeout(pending.timer);
  const changes = pending?.changes ?? new Set<AnnotationTaskChange>();
  changes.add(change);

  // Cancel the running refetches this edit will repeat after the pause. Not a
  // first load (no data yet): that one keeps going.
  const willRefetch = (query: { queryKey: QueryKey; state: { data: unknown } }) =>
    query.state.data !== undefined
    && ((query.queryKey[0] === "annotation_tasks_stats" && change === "status")
      || filterAffectedByChange(filterFromQueryKey(query.queryKey), change));
  for (const queryKey of [["annotation_tasks"], ["annotation_tasks_index"], ["annotation_tasks_stats"]]) {
    void client.cancelQueries({ queryKey, predicate: willRefetch });
  }

  pendingInvalidations.set(client, {
    changes,
    timer: setTimeout(() => {
      pendingInvalidations.delete(client);
      changes.forEach((pendingChange) => invalidateAnnotationTaskQueries(client, pendingChange));
    }, DEFERRED_INVALIDATION_MS),
  });
}
