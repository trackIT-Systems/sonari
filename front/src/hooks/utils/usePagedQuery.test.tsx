import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import type { GetManyQuery } from "@/api/common";
import usePagedQuery from "@/hooks/utils/usePagedQuery";

/** A fetch per call that resolves only when the test says so */
function controlledFetch() {
  const pending: { query: GetManyQuery; resolve: () => void }[] = [];
  const queryFn = (query: GetManyQuery) =>
    new Promise<{ items: number[]; total: number; limit: number; offset: number }>((resolve) => {
      const offset = query.offset ?? 0;
      pending.push({
        query,
        resolve: () => resolve({ items: [offset, offset + 1], total: 6, limit: 2, offset }),
      });
    });
  return { pending, queryFn };
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("usePagedQuery", () => {
  it("shows no rows of the previous page while the next one loads", async () => {
    const { pending, queryFn } = controlledFetch();
    const { result, rerender } = renderHook(
      ({ filter }: { filter: object }) => usePagedQuery({ name: "test", queryFn, pageSize: 2, filter }),
      { wrapper, initialProps: { filter: { a: 1 } } },
    );

    await waitFor(() => expect(pending).toHaveLength(1));
    act(() => pending[0].resolve());
    await waitFor(() => expect(result.current.items).toEqual([0, 1]));

    act(() => result.current.pagination.nextPage());
    await waitFor(() => expect(pending).toHaveLength(2));
    expect(result.current.items).toEqual([]);
    expect(result.current.isPageLoading).toBe(true);
    // The total stays, so the pagination does not jump
    expect(result.current.total).toBe(6);
    expect(result.current.pagination.page).toBe(1);

    act(() => pending[1].resolve());
    await waitFor(() => expect(result.current.items).toEqual([2, 3]));
    expect(result.current.isPageLoading).toBe(false);

    // A new filter on the same page keeps the current rows while it loads
    rerender({ filter: { a: 2 } });
    await waitFor(() => expect(pending).toHaveLength(3));
    expect(result.current.items).toEqual([2, 3]);
    expect(result.current.isPageLoading).toBe(false);
  });
});
