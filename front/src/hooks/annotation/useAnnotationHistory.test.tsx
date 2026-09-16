import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import useAnnotationHistory, {
  type AnnotationHistoryMutations,
} from "@/hooks/annotation/useAnnotationHistory";
import { MAX_UNDO_STACK } from "@/hooks/annotation/annotationHistoryTypes";
import type { Geometry, SoundEventAnnotation, Tag } from "@/types";

vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const geometry: Geometry = { type: "TimeInterval", coordinates: [0, 1] };

const sampleSea = (id: number): SoundEventAnnotation =>
  ({
    id,
    annotation_task_id: 1,
    recording_id: 1,
    geometry_type: "TimeInterval",
    geometry,
    tags: [],
  }) as SoundEventAnnotation;

let uuidCounter = 0;

beforeEach(() => {
  uuidCounter = 0;
  vi.stubGlobal("crypto", {
    randomUUID: () => `test-uuid-${++uuidCounter}`,
  });
});

function createMutations(
  overrides: Partial<AnnotationHistoryMutations> = {},
): AnnotationHistoryMutations {
  return {
    addSoundEventAnnotation: vi.fn(async () => sampleSea(10)),
    removeSoundEventAnnotation: vi.fn(async (annotation) => annotation),
    updateSoundEventAnnotation: vi.fn(async ({ soundEventAnnotation, geometry }) => ({
      ...soundEventAnnotation,
      geometry,
    })),
    addTagToSoundEventAnnotation: vi.fn(async ({ soundEventAnnotation }) =>
      soundEventAnnotation,
    ),
    removeTagFromSoundEventAnnotation: vi.fn(
      async ({ soundEventAnnotation }) => soundEventAnnotation,
    ),
    addTaskTag: vi.fn(async () => undefined),
    removeTaskTag: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("useAnnotationHistory", () => {
  it("records create and undoes with delete", async () => {
    const mutations = createMutations();
    const { result } = renderHook(() =>
      useAnnotationHistory({
        taskId: 1,
        soundEventAnnotations: [],
        mutations,
      }),
    );

    await act(async () => {
      await result.current.wrapAddSoundEventAnnotation({ geometry, tags: [] });
    });

    expect(result.current.canUndo).toBe(true);
    expect(result.current.undoLabel).toBe("Create sound event");

    await act(async () => {
      await result.current.undo();
    });

    expect(mutations.removeSoundEventAnnotation).toHaveBeenCalledTimes(1);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
  });

  it("redoes a previously undone command", async () => {
    const mutations = createMutations();
    const { result } = renderHook(() =>
      useAnnotationHistory({
        taskId: 1,
        soundEventAnnotations: [],
        mutations,
      }),
    );

    await act(async () => {
      await result.current.wrapAddSoundEventAnnotation({ geometry, tags: [] });
    });
    await act(async () => {
      await result.current.undo();
    });
    await act(async () => {
      await result.current.redo();
    });

    expect(mutations.addSoundEventAnnotation).toHaveBeenCalledTimes(2);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it("does not record patches while replaying undo", async () => {
    const mutations = createMutations();
    const { result } = renderHook(() =>
      useAnnotationHistory({
        taskId: 1,
        soundEventAnnotations: [],
        mutations,
      }),
    );

    await act(async () => {
      await result.current.wrapAddSoundEventAnnotation({ geometry, tags: [] });
    });
    await act(async () => {
      await result.current.undo();
    });

    await waitFor(() => {
      expect(result.current.canUndo).toBe(false);
    });
    expect(mutations.removeSoundEventAnnotation).toHaveBeenCalledTimes(1);
    expect(mutations.addSoundEventAnnotation).toHaveBeenCalledTimes(1);
  });

  it("returns empty events when undoing an empty stack", async () => {
    const mutations = createMutations();
    const { result } = renderHook(() =>
      useAnnotationHistory({
        taskId: 1,
        soundEventAnnotations: [],
        mutations,
      }),
    );

    let events: unknown;
    await act(async () => {
      events = await result.current.undo();
    });

    expect(events).toEqual([]);
    expect(mutations.removeSoundEventAnnotation).not.toHaveBeenCalled();
  });

  it("groups patches in runBatch into one undo command", async () => {
    const tag: Tag = { key: "species", value: "bird" };
    const sea = sampleSea(2);
    const mutations = createMutations();
    const { result } = renderHook(() =>
      useAnnotationHistory({
        taskId: 1,
        soundEventAnnotations: [sea],
        mutations,
      }),
    );

    await act(async () => {
      await result.current.runBatch("Bulk tags", async () => {
        await result.current.wrapAddTaskTag(tag);
        await result.current.wrapAddTagToSoundEventAnnotation({
          soundEventAnnotation: sea,
          tag,
        });
      });
    });

    expect(result.current.canUndo).toBe(true);
    expect(result.current.undoLabel).toBe("Bulk tags");

    await act(async () => {
      await result.current.undo();
    });

    expect(mutations.removeTaskTag).toHaveBeenCalledWith(tag);
    expect(mutations.removeTagFromSoundEventAnnotation).toHaveBeenCalled();
  });

  it("clears history when taskId changes", async () => {
    const mutations = createMutations();
    const { result, rerender } = renderHook(
      ({ taskId }) =>
        useAnnotationHistory({
          taskId,
          soundEventAnnotations: [],
          mutations,
        }),
      { initialProps: { taskId: 1 as number | undefined } },
    );

    await act(async () => {
      await result.current.wrapAddSoundEventAnnotation({ geometry, tags: [] });
    });
    expect(result.current.canUndo).toBe(true);

    rerender({ taskId: 2 });
    await waitFor(() => {
      expect(result.current.canUndo).toBe(false);
    });
  });

  it("trims undo stack to MAX_UNDO_STACK", async () => {
    const mutations = createMutations();
    const { result } = renderHook(() =>
      useAnnotationHistory({
        taskId: 1,
        soundEventAnnotations: [],
        mutations,
      }),
    );

    for (let i = 0; i < MAX_UNDO_STACK + 3; i += 1) {
      await act(async () => {
        await result.current.wrapAddTaskTag({ key: `k${i}`, value: `v${i}` });
      });
    }

    for (let i = 0; i < MAX_UNDO_STACK + 3; i += 1) {
      await act(async () => {
        await result.current.undo();
      });
    }

    expect(mutations.removeTaskTag).toHaveBeenCalledTimes(MAX_UNDO_STACK);
  });

  it("leaves undo stack unchanged when undo mutation fails", async () => {
    const mutations = createMutations({
      removeSoundEventAnnotation: vi.fn(async () => {
        throw new Error("404");
      }),
    });
    const { result } = renderHook(() =>
      useAnnotationHistory({
        taskId: 1,
        soundEventAnnotations: [],
        mutations,
      }),
    );

    await act(async () => {
      await result.current.wrapAddSoundEventAnnotation({ geometry, tags: [] });
    });

    await act(async () => {
      await result.current.undo();
    });

    expect(result.current.canUndo).toBe(true);
  });
});
