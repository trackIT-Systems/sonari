import { describe, expect, it } from "vitest";

import { reconcileAnnotationTaskIndex } from "./reconcileAnnotationTaskIndex";

describe("reconcileAnnotationTaskIndex", () => {
  it("waits while the index is loading", () => {
    expect(
      reconcileAnnotationTaskIndex({
        currentTaskId: 5,
        itemIds: [1, 2],
        isLoading: true,
      }),
    ).toBe("none");
  });

  it("does not navigate when the filter matches no tasks", () => {
    expect(
      reconcileAnnotationTaskIndex({
        currentTaskId: 5,
        itemIds: [],
        isLoading: false,
      }),
    ).toBe("none");
  });

  it("selects the first task when none is selected", () => {
    expect(
      reconcileAnnotationTaskIndex({
        currentTaskId: null,
        itemIds: [10, 11],
        isLoading: false,
      }),
    ).toBe("go_to_first");
  });

  it("selects the first task when the current task is not in the filtered list", () => {
    expect(
      reconcileAnnotationTaskIndex({
        currentTaskId: 99,
        itemIds: [10, 11],
        isLoading: false,
      }),
    ).toBe("go_to_first");
  });

  it("keeps the current task when it is still in the filtered list", () => {
    expect(
      reconcileAnnotationTaskIndex({
        currentTaskId: 11,
        itemIds: [10, 11],
        isLoading: false,
      }),
    ).toBe("none");
  });
});
