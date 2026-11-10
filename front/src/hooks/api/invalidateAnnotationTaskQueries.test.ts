import { QueryClient, type QueryKey } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type AnnotationTaskChange,
  filterAffectedByChange,
  filterFromQueryKey,
  invalidateAnnotationTaskQueries,
  DEFERRED_INVALIDATION_MS,
  scheduleAnnotationTaskQueriesInvalidation,
} from "./invalidateAnnotationTaskQueries";

const project = { annotation_project: { id: 1 } };

// Key shapes as built by usePagedQuery, useAnnotationTaskStats and AnnotationTaskTable
const pagedIndexKey = (filter: object): QueryKey => ["annotation_tasks_index", 0, -1, JSON.stringify(filter)];
const tableIndexKey = (filter: object): QueryKey => ["annotation_tasks_index", filter];
const statsKey = (filter: object): QueryKey => ["annotation_tasks_stats", JSON.stringify(filter)];
const listKey = (filter: object): QueryKey => ["annotation_tasks", 0, 100, JSON.stringify(filter)];

function invalidatedAfter(change: AnnotationTaskChange, keys: QueryKey[]): boolean[] {
  const client = new QueryClient();
  for (const key of keys) {
    client.setQueryData(key, {});
  }
  invalidateAnnotationTaskQueries(client, change);
  return keys.map((key) => client.getQueryState(key)?.isInvalidated ?? false);
}

describe("filterFromQueryKey", () => {
  it("reads serialized and plain filters", () => {
    expect(filterFromQueryKey(pagedIndexKey(project))).toEqual(project);
    expect(filterFromQueryKey(tableIndexKey(project))).toEqual(project);
    expect(filterFromQueryKey(statsKey({}))).toEqual({});
  });

  it("returns null without a filter", () => {
    expect(filterFromQueryKey(["annotation_tasks_index"])).toBeNull();
    expect(filterFromQueryKey(["annotation_tasks_index", 0, "not json"])).toBeNull();
  });
});

describe("filterAffectedByChange", () => {
  it("ignores filters that no single task edit can change", () => {
    const filter = { ...project, date_range: { start_date: "2026-01-01" }, sort_by: "-created_on" };
    for (const change of ["status", "task_tag", "note", "sound_event"] as const) {
      expect(filterAffectedByChange(filter, change)).toBe(false);
    }
  });

  it("matches filters to the kind of edit", () => {
    expect(filterAffectedByChange({ ...project, pending: true }, "status")).toBe(true);
    expect(filterAffectedByChange({ ...project, pending: false }, "status")).toBe(true);
    expect(filterAffectedByChange({ ...project, pending: true }, "sound_event")).toBe(false);
    expect(filterAffectedByChange({ assigned_to: { id: "u" } }, "status")).toBe(true);
    expect(filterAffectedByChange({ annotation_task_tag: { key: "a", value: "b" } }, "task_tag")).toBe(true);
    expect(filterAffectedByChange({ annotation_task_tag: { key: "a", value: "b" } }, "sound_event")).toBe(false);
    expect(filterAffectedByChange({ task_tag: [{ key: "a", value: "b" }] }, "task_tag")).toBe(true);
    expect(filterAffectedByChange({ task_tag_count: { eq: 1 } }, "task_tag")).toBe(true);
    expect(filterAffectedByChange({ task_tag: [{ key: "a", value: "b" }] }, "sound_event")).toBe(false);
    expect(filterAffectedByChange({ empty: true }, "sound_event")).toBe(true);
    expect(filterAffectedByChange({ confidence: { gt: 0.5 } }, "sound_event")).toBe(true);
  });

  it("skips filter keys without a value", () => {
    expect(filterAffectedByChange({ ...project, pending: undefined, verified: null }, "status")).toBe(false);
  });

  it("counts included data that the edit changes", () => {
    expect(filterAffectedByChange({ include_status_badges: true }, "status")).toBe(true);
    expect(filterAffectedByChange({ include_status_badges: false }, "status")).toBe(false);
    expect(filterAffectedByChange({ include_status_badges: true }, "note")).toBe(false);
    expect(filterAffectedByChange({ include_sound_event_tags: true }, "sound_event")).toBe(true);
    expect(filterAffectedByChange({ include_annotation_project: true }, "sound_event")).toBe(false);
  });

  it("treats unknown filters and missing filters as affected", () => {
    expect(filterAffectedByChange({ ...project, some_new_filter: 1 }, "note")).toBe(true);
    expect(filterAffectedByChange(null, "note")).toBe(true);
  });
});

describe("invalidateAnnotationTaskQueries", () => {
  it("keeps index and stats of an unrelated filter after a sound event edit", () => {
    const keys = [
      pagedIndexKey({ ...project, pending: true }),
      statsKey({ ...project, pending: true }),
      tableIndexKey({ ...project, pending: true }),
      // Tasks of the open recording, as loaded by the annotate view
      listKey({ recording: { eq: 3 }, include_annotation_project: true, include_status_badges: false }),
    ];
    expect(invalidatedAfter("sound_event", keys)).toEqual([false, false, false, false]);
  });

  it("refetches index and stats when the filter depends on the edit", () => {
    const filter = { ...project, sound_event_annotation_tag: { key: "species", value: "x" } };
    expect(invalidatedAfter("sound_event", [pagedIndexKey(filter), statsKey(filter), tableIndexKey(filter)])).toEqual([
      true,
      true,
      true,
    ]);
  });

  it("always refetches stats after a status edit", () => {
    expect(invalidatedAfter("status", [pagedIndexKey(project), statsKey(project)])).toEqual([false, true]);
  });

  it("refetches lists that include the changed data", () => {
    const tableList = listKey({ ...project, include_tags: true, include_notes: true, include_status_badges: true });
    expect(invalidatedAfter("note", [tableList])).toEqual([true]);
    expect(invalidatedAfter("task_tag", [tableList])).toEqual([true]);
  });

  it("never refetches index or stats after a note edit", () => {
    expect(invalidatedAfter("note", [pagedIndexKey({ ...project, pending: true }), statsKey(project)])).toEqual([
      false,
      false,
    ]);
  });

  it("leaves other queries alone", () => {
    expect(invalidatedAfter("status", [["annotation_task", 1], ["annotation_projects", 0, 10, "{}"]])).toEqual([
      false,
      false,
    ]);
  });
});

describe("scheduleAnnotationTaskQueriesInvalidation", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const pendingIndex = pagedIndexKey({ ...project, pending: true });
  const stats = statsKey(project);

  function clientWith(keys: QueryKey[]) {
    const client = new QueryClient();
    for (const key of keys) client.setQueryData(key, { items: [] });
    return client;
  }
  const invalidated = (client: QueryClient, key: QueryKey) => client.getQueryState(key)?.isInvalidated ?? false;

  it("refetches once the edits pause, not after each one", () => {
    const client = clientWith([pendingIndex, stats]);
    const invalidate = vi.spyOn(client, "invalidateQueries");

    for (let i = 0; i < 5; i++) {
      scheduleAnnotationTaskQueriesInvalidation(client, "status");
      vi.advanceTimersByTime(DEFERRED_INVALIDATION_MS / 2);
    }
    expect(invalidated(client, pendingIndex)).toBe(false);
    expect(invalidate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(DEFERRED_INVALIDATION_MS);
    expect(invalidated(client, pendingIndex)).toBe(true);
    expect(invalidated(client, stats)).toBe(true);
    // One round of invalidation (lists, index, stats), not five
    expect(invalidate).toHaveBeenCalledTimes(3);
  });

  it("covers every kind of edit made before the pause", () => {
    const tagIndex = pagedIndexKey({ ...project, annotation_task_tag: { key: "a", value: "b" } });
    const client = clientWith([pendingIndex, tagIndex]);
    scheduleAnnotationTaskQueriesInvalidation(client, "status");
    scheduleAnnotationTaskQueriesInvalidation(client, "task_tag");
    vi.advanceTimersByTime(DEFERRED_INVALIDATION_MS);
    expect(invalidated(client, pendingIndex)).toBe(true);
    expect(invalidated(client, tagIndex)).toBe(true);
  });

  it("cancels a running refetch that the edit will repeat, and only that one", async () => {
    const otherIndex = pagedIndexKey({ ...project, date_range: { start_date: "2026-01-01" } });
    const client = clientWith([pendingIndex, otherIndex]);
    const signals = new Map<string, AbortSignal>();
    for (const key of [pendingIndex, otherIndex]) {
      void client.fetchQuery({
        queryKey: key,
        queryFn: ({ signal }) => {
          signals.set(JSON.stringify(key), signal);
          return new Promise(() => {});
        },
      });
    }
    await Promise.resolve();

    scheduleAnnotationTaskQueriesInvalidation(client, "status");
    expect(signals.get(JSON.stringify(pendingIndex))?.aborted).toBe(true);
    // A status edit cannot change this list: its refetch keeps going
    expect(signals.get(JSON.stringify(otherIndex))?.aborted).toBe(false);
    void client.cancelQueries();
  });
});
