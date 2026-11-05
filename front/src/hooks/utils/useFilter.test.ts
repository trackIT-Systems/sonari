import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import useFilter from "@/hooks/utils/useFilter";

type F = { search?: string };
const defaults: F = {};

describe("useFilter isPending", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("is pending until the debounced filter catches up", () => {
    const { result } = renderHook(() => useFilter<F>({ defaults, debounce: 500 }));
    expect(result.current.isPending).toBe(false);

    act(() => result.current.set("search", "bat"));
    expect(result.current.isPending).toBe(true);
    expect(result.current.filter.search).toBeUndefined();

    act(() => vi.advanceTimersByTime(500));
    expect(result.current.isPending).toBe(false);
    expect(result.current.filter.search).toBe("bat");
  });

  it("is not pending after clearing (applied immediately)", () => {
    const { result } = renderHook(() => useFilter<F>({ defaults, debounce: 500 }));
    act(() => result.current.set("search", "bat"));
    act(() => vi.advanceTimersByTime(500));
    act(() => result.current.clear("search"));
    expect(result.current.isPending).toBe(false);
  });
});
