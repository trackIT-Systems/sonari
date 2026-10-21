import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import useDevicePixelRatio from "./useDevicePixelRatio";

const original = window.devicePixelRatio;

afterEach(() => {
  Object.defineProperty(window, "devicePixelRatio", { value: original, configurable: true });
});

function setRatio(value: number) {
  Object.defineProperty(window, "devicePixelRatio", { value, configurable: true });
}

describe("useDevicePixelRatio", () => {
  it("returns the current ratio and follows changes", () => {
    setRatio(2);
    const { result } = renderHook(() => useDevicePixelRatio());
    expect(result.current).toBe(2);

    // Browser zoom changes the ratio and fires resize
    setRatio(2.5);
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(result.current).toBe(2.5);
  });
});
