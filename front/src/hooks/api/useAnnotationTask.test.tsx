import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import useAnnotationTask from "@/hooks/api/useAnnotationTask";
import { DEFERRED_INVALIDATION_MS } from "@/hooks/api/invalidateAnnotationTaskQueries";
import type { AnnotationTask } from "@/types";

const badge = (state: "completed" | "assigned") => ({ state, user: null, created_on: new Date(0) });

const fullTask = {
  id: 5,
  annotation_project_id: 1,
  recording_id: 2,
  start_time: 0,
  end_time: 1,
  sound_event_annotations: [{ id: 9 }],
  tags: [{ key: "a", value: "b" }],
  status_badges: [badge("assigned")],
} as unknown as AnnotationTask;

// The badge endpoints answer with the badges only: unloaded relations are empty
const slim = (badges: ReturnType<typeof badge>[]) =>
  ({ ...fullTask, sound_event_annotations: [], tags: [], status_badges: badges }) as unknown as AnnotationTask;

const addBadge = vi.fn(async () => slim([badge("assigned"), badge("completed")]));
const removeBadge = vi.fn(async () => slim([]));

vi.mock("@/app/api", () => ({
  default: {
    annotationTasks: {
      get: async () => fullTask,
      addBadge: () => addBadge(),
      removeBadge: () => removeBadge(),
    },
  },
}));

function renderTask() {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const indexKey = ["annotation_tasks_index", 0, -1, JSON.stringify({ pending: true })];
  client.setQueryData(indexKey, { items: [], total: 0 });
  const hook = renderHook(() => useAnnotationTask({ id: fullTask.id, annotationTask: fullTask }), { wrapper });
  return { ...hook, client, indexKey };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useAnnotationTask badges", () => {
  it("takes over only the badges, keeping the sound events and tags of the task", async () => {
    const { result, client } = renderTask();
    await waitFor(() => expect(result.current.data).toBeDefined());

    await act(() => result.current.addBadge.mutateAsync("completed"));
    const cached = client.getQueryData<AnnotationTask>(["annotation_task", fullTask.id])!;
    expect(cached.status_badges?.map((b) => b.state)).toEqual(["assigned", "completed"]);
    expect(cached.sound_event_annotations).toEqual(fullTask.sound_event_annotations);
    expect(cached.tags).toEqual(fullTask.tags);

    await act(() => result.current.removeBadge.mutateAsync("completed"));
    const afterRemove = client.getQueryData<AnnotationTask>(["annotation_task", fullTask.id])!;
    expect(afterRemove.status_badges).toEqual([]);
    expect(afterRemove.sound_event_annotations).toEqual(fullTask.sound_event_annotations);
  });

  it("refetches the task index only after the badges pause", async () => {
    const { result, client, indexKey } = renderTask();
    await waitFor(() => expect(result.current.data).toBeDefined());
    vi.useFakeTimers();

    await act(() => result.current.addBadge.mutateAsync("completed"));
    expect(client.getQueryState(indexKey)?.isInvalidated).toBe(false);

    act(() => vi.advanceTimersByTime(DEFERRED_INVALIDATION_MS));
    expect(client.getQueryState(indexKey)?.isInvalidated).toBe(true);
  });
});
