import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import useAnnotationUndoKeyShortcuts from "@/hooks/annotation/useAnnotationUndoKeyShortcuts";

function keyDown(
  key: string,
  options: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean } = {},
) {
  const event = new KeyboardEvent("keydown", {
    key,
    ctrlKey: options.ctrlKey ?? true,
    metaKey: options.metaKey ?? false,
    shiftKey: options.shiftKey ?? false,
    bubbles: true,
  });
  window.dispatchEvent(event);
  window.dispatchEvent(
    new KeyboardEvent("keyup", {
      key,
      ctrlKey: options.ctrlKey ?? true,
      metaKey: options.metaKey ?? false,
      shiftKey: options.shiftKey ?? false,
      bubbles: true,
    }),
  );
}

describe("useAnnotationUndoKeyShortcuts", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls onUndo when ctrl+z is pressed and canUndo is true", () => {
    const onUndo = vi.fn();
    renderHook(() =>
      useAnnotationUndoKeyShortcuts({
        enabled: true,
        canUndo: true,
        canRedo: false,
        onUndo,
      }),
    );

    keyDown("z");
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("does not call onUndo when canUndo is false", () => {
    const onUndo = vi.fn();
    renderHook(() =>
      useAnnotationUndoKeyShortcuts({
        enabled: true,
        canUndo: false,
        onUndo,
      }),
    );

    keyDown("z");
    expect(onUndo).not.toHaveBeenCalled();
  });

  it("uses latest canUndo from refs after rerender", () => {
    const onUndo = vi.fn();
    const { rerender } = renderHook(
      ({ canUndo }) =>
        useAnnotationUndoKeyShortcuts({
          enabled: true,
          canUndo,
          onUndo,
        }),
      { initialProps: { canUndo: false } },
    );

    keyDown("z");
    expect(onUndo).not.toHaveBeenCalled();

    rerender({ canUndo: true });
    keyDown("z");
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("calls onRedo for ctrl+shift+z when canRedo is true", () => {
    const onRedo = vi.fn();
    renderHook(() =>
      useAnnotationUndoKeyShortcuts({
        enabled: true,
        canRedo: true,
        onRedo,
      }),
    );

    keyDown("z", { shiftKey: true });
    expect(onRedo).toHaveBeenCalledTimes(1);
  });

  it("ignores shortcuts in text inputs", () => {
    const onUndo = vi.fn();
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    renderHook(() =>
      useAnnotationUndoKeyShortcuts({
        enabled: true,
        canUndo: true,
        onUndo,
      }),
    );

    const event = new KeyboardEvent("keydown", {
      key: "z",
      ctrlKey: true,
      bubbles: true,
    });
    input.dispatchEvent(event);
    expect(onUndo).not.toHaveBeenCalled();

    document.body.removeChild(input);
  });
});
