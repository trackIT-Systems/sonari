import { QueryClient, type QueryKey } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import {
  type AnnotationTaskChange,
  filterAffectedByChange,
  filterFromQueryKey,
  invalidateAnnotationTaskQueries,
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
