import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AnnotationTask } from "@/types";

// The filtered index: tasks 10, 20, 30, 40. Task 25 lies outside the filter.
const items = [10, 20, 30, 40].map((id) => ({ id, recording_id: 1, start_time: id }));

vi.mock("@/hooks/api/useAnnotationTaskIndex", () => ({
  default: () => ({
    items,
    filter: { filter: {}, set: vi.fn() },
    isLoading: false,
    isFetching: false,
    isError: false,
    queryKey: ["index"],
    dataUpdatedAt: Date.now() + 60_000,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/hooks/api/useAnnotationTaskStats", () => ({
  default: () => ({ stats: undefined }),
}));

import useAnnotateTasks from "./useAnnotateTasks";

const task = (id: number) => ({ id }) as AnnotationTask;

function setup(initial: number, anchor: number | null = null) {
  const onChangeTask = vi.fn();
  const onVisitTask = vi.fn();
  const hook = renderHook(
    ({ annotationTask, timeAnchorTaskId }) =>
      useAnnotateTasks({
        annotationTask,
        timeAnchorTaskId,
        onChangeTask,
        onVisitTask,
        persistFilter: false,
        onDeselectSoundEventAnnotation: vi.fn(),
      }),
    { initialProps: { annotationTask: task(initial), timeAnchorTaskId: anchor } },
  );
  return { ...hook, onChangeTask, onVisitTask };
}

describe("useAnnotateTasks trips outside the filter", () => {
  it("opens a task outside the filter and remembers the task it left", () => {
    const { result, onVisitTask, onChangeTask } = setup(20);
    act(() => result.current.visitTask(task(25)));
    expect(onVisitTask).toHaveBeenCalledWith(task(25), 20);
    expect(onChangeTask).not.toHaveBeenCalled();
  });

  it("opens a task the filter matches as usual", () => {
    const { result, onVisitTask, onChangeTask } = setup(20);
    act(() => result.current.visitTask(task(30)));
    expect(onChangeTask).toHaveBeenCalledWith(task(30));
    expect(onVisitTask).not.toHaveBeenCalled();
  });

  it("continues next and previous from the task it left, and goes back to it", () => {
    const { result, onChangeTask } = setup(25, 20);
    expect(result.current.tripAnchorTaskId).toBe(20);
    expect(result.current.filterMismatchTaskId).toBeNull();
    expect(result.current.upcomingTasks.map((t) => t.id)).toEqual([30, 40]);

    act(() => result.current.nextTask());
    expect(onChangeTask).toHaveBeenLastCalledWith(expect.objectContaining({ id: 30 }));
  });

  it("goes to the task before the one it left", () => {
    const { result, onChangeTask } = setup(25, 20);
    act(() => result.current.prevTask());
    expect(onChangeTask).toHaveBeenLastCalledWith(expect.objectContaining({ id: 10 }));
  });

  it("goes back to the task it left", () => {
    const { result, onChangeTask } = setup(25, 20);
    act(() => result.current.backToTripAnchor());
    expect(onChangeTask).toHaveBeenLastCalledWith(expect.objectContaining({ id: 20 }));
  });

  it("keeps the first task's anchor when going further in time", () => {
    const { result, onVisitTask } = setup(25, 20);
    act(() => result.current.visitTask(task(26)));
    expect(onVisitTask).toHaveBeenCalledWith(task(26), 20);
  });

  it("does not jump to the first filtered task while outside the filter", () => {
    const { result, onChangeTask } = setup(25, 20);
    expect(onChangeTask).not.toHaveBeenCalled();
    expect(result.current.task?.id).toBe(25);
  });
});
