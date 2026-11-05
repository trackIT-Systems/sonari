import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import useAnnotationTaskBulkActions, {
  BULK_REQUEST_SIZE,
} from "@/hooks/api/useAnnotationTaskBulkActions";

const bulkResolveIds = vi.fn();
const bulkAddBadge = vi.fn();
const bulkRemoveBadge = vi.fn();

vi.mock("@/app/api", () => ({
  default: {
    annotationTasks: {
      bulkResolveIds: (...args: unknown[]) => bulkResolveIds(...args),
      bulkAddBadge: (...args: unknown[]) => bulkAddBadge(...args),
      bulkRemoveBadge: (...args: unknown[]) => bulkRemoveBadge(...args),
    },
  },
}));

vi.mock("react-hot-toast", () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return { default: toast };
});

function result(batch: number[]) {
  return {
    tasks_targeted: batch.length,
    tasks_updated: batch.length,
    tasks_skipped: 0,
    sound_events_updated: 0,
    sound_events_skipped: 0,
    failures: [],
  };
}

function renderBulk() {
  const client = new QueryClient();
  return renderHook(
    () => useAnnotationTaskBulkActions({ filter: { annotation_project: { id: 1 } } as any }),
    {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  );
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe("useAnnotationTaskBulkActions", () => {
  beforeEach(() => {
    bulkResolveIds.mockReset();
    bulkAddBadge.mockReset().mockImplementation(async ({ annotation_task_ids }) =>
      result(annotation_task_ids),
    );
    bulkRemoveBadge.mockReset().mockImplementation(async ({ annotation_task_ids }) =>
      result(annotation_task_ids),
    );
  });

  it("resolves every task matching the filter and sends them in batches", async () => {
    const all = ids(BULK_REQUEST_SIZE * 2 + 3);
    bulkResolveIds.mockResolvedValue(all);
    const { result: hook } = renderBulk();

    let outcome: any;
    await act(async () => {
      outcome = await hook.current.bulkAddBadge.mutateAsync({ state: "completed" });
    });

    expect(bulkResolveIds).toHaveBeenCalledTimes(1);
    const batches = bulkAddBadge.mock.calls.map(([body]) => body.annotation_task_ids);
    expect(batches.map((b: number[]) => b.length)).toEqual([BULK_REQUEST_SIZE, BULK_REQUEST_SIZE, 3]);
    expect(batches.flat()).toEqual(all);
    expect(outcome).toMatchObject({ tasks_targeted: all.length, tasks_updated: all.length, stopped: false });
    expect(hook.current.progress).toBeNull();
  });

  it("sends ticked tasks without resolving the filter", async () => {
    const { result: hook } = renderBulk();
    await act(async () => {
      await hook.current.bulkRemoveBadge.mutateAsync({ annotation_task_ids: [4, 5], state: "verified" });
    });
    expect(bulkResolveIds).not.toHaveBeenCalled();
    expect(bulkRemoveBadge).toHaveBeenCalledTimes(1);
    expect(bulkRemoveBadge.mock.calls[0][0]).toMatchObject({
      annotation_task_ids: [4, 5],
      state: "verified",
    });
  });

  it("stops after the current batch", async () => {
    bulkResolveIds.mockResolvedValue(ids(BULK_REQUEST_SIZE * 3));
    let releaseFirst!: () => void;
    bulkAddBadge.mockImplementationOnce(
      ({ annotation_task_ids }) =>
        new Promise((resolve) => {
          releaseFirst = () => resolve(result(annotation_task_ids));
        }),
    );
    const { result: hook } = renderBulk();

    let pending!: Promise<any>;
    act(() => {
      pending = hook.current.bulkAddBadge.mutateAsync({ state: "completed" });
    });
    await waitFor(() => expect(bulkAddBadge).toHaveBeenCalledTimes(1));
    expect(hook.current.progress).toEqual({ done: 0, total: BULK_REQUEST_SIZE * 3 });

    let outcome: any;
    await act(async () => {
      hook.current.stop();
      releaseFirst();
      outcome = await pending;
    });

    expect(bulkAddBadge).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({ tasks_updated: BULK_REQUEST_SIZE, stopped: true });
  });
});
