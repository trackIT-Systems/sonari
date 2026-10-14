import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import GuidedTourCoach from "./GuidedTourCoach";
import {
  emitGuidedTourEvent,
  isGuidedTourLessonBlocking,
  subscribeGuidedTourEvents,
  useGuidedTourReturnEvent,
} from "./events";
import type { GuidedTourLesson } from "./types";

beforeEach(() => {
  window.localStorage.clear();
  // jsdom has no ResizeObserver; the highlight ring only needs the API shape.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useGuidedTourReturnEvent", () => {
  it("fires only when the value returns to its target, never initially", () => {
    const seen: string[] = [];
    const unsubscribe = subscribeGuidedTourEvents((e) => seen.push(e));
    const { rerender } = renderHook(({ value }) => useGuidedTourReturnEvent(value, true, "spectrogram-shown"), {
      initialProps: { value: true },
    });
    expect(seen).toEqual([]);

    rerender({ value: false }); // hidden
    expect(seen).toEqual([]);
    rerender({ value: true }); // shown again
    expect(seen).toEqual(["spectrogram-shown"]);
    unsubscribe();
  });
});

describe("GuidedTourCoach", () => {
  const finalLesson: GuidedTourLesson = {
    id: "wrap-up",
    title: "Done",
    steps: [
      {
        target: "task-notes",
        title: "Your feedback",
        task: "Write a feedback note",
        complete: { type: "event", event: "note-created" },
      },
      { target: "status-badges", title: "Tour complete" },
    ],
  };

  it("unblocks badges once a lesson ending on a read-only step is reached", async () => {
    render(<GuidedTourCoach lesson={finalLesson} projectId={1} storageKey="k-final" />);
    expect(isGuidedTourLessonBlocking()).toBe(true);

    vi.useFakeTimers();
    act(() => emitGuidedTourEvent("note-created"));
    await act(async () => {
      vi.advanceTimersByTime(1000); // auto-advance to the read-only last step
    });
    vi.useRealTimers();

    expect(screen.getByText("Tour complete")).toBeTruthy();
    expect(isGuidedTourLessonBlocking()).toBe(false);
  });

  it("shows a completion screen on Finish tour, then leaves the tour", () => {
    const onFinish = vi.fn();
    window.localStorage.setItem("k-finish", JSON.stringify({ stepIndex: 1, done: [true, true] }));
    render(<GuidedTourCoach lesson={finalLesson} projectId={1} storageKey="k-finish" onFinish={onFinish} />);

    fireEvent.click(screen.getByRole("button", { name: "Finish tour" }));
    expect(onFinish).not.toHaveBeenCalled();
    expect(screen.getByText(/Tour complete/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Leave tour" }));
    expect(onFinish).toHaveBeenCalled();
  });

  it("lists unfinished lessons instead of finishing the tour", () => {
    const onFinish = vi.fn();
    window.localStorage.setItem("k-missing", JSON.stringify({ stepIndex: 1, done: [true, true] }));
    render(
      <GuidedTourCoach
        lesson={finalLesson}
        projectId={1}
        storageKey="k-missing"
        onFinish={onFinish}
        getUnfinishedLessons={() => ["Lesson 3: Zoom"]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Finish tour" }));
    expect(screen.getByText("Lesson 3: Zoom")).toBeTruthy();
    expect(onFinish).not.toHaveBeenCalled();
  });

  it("does not jump forward again when going Back to a finished step", async () => {
    const lesson: GuidedTourLesson = {
      id: "back",
      title: "Back",
      steps: [
        { target: "a", title: "First", task: "Pan", complete: { type: "event", event: "view-panned" } },
        { target: "b", title: "Second", task: "Zoom", complete: { type: "event", event: "view-zoomed" } },
      ],
    };
    render(<GuidedTourCoach lesson={lesson} projectId={1} storageKey="k-back" />);

    vi.useFakeTimers();
    act(() => emitGuidedTourEvent("view-panned"));
    await act(async () => {
      vi.advanceTimersByTime(1000); // auto-advance to the second step
    });
    expect(screen.getByText("Second")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    vi.useRealTimers();

    expect(screen.getByText("First")).toBeTruthy();
    expect(screen.queryByText("Second")).toBeNull();
  });

  it("saves progress at once, before the coach can be unmounted by navigation", () => {
    const lesson: GuidedTourLesson = {
      id: "nav",
      title: "Nav",
      steps: [{ target: "a", title: "Go", task: "Click", complete: { type: "event", event: "view-panned" } }],
    };
    const { unmount } = render(<GuidedTourCoach lesson={lesson} projectId={1} storageKey="k-nav" />);
    act(() => emitGuidedTourEvent("view-panned"));
    unmount();
    expect(JSON.parse(window.localStorage.getItem("k-nav")!).done).toEqual([true]);
  });

  it("releases focus from a clicked button so shortcuts keep working", async () => {
    render(
      <>
        <button type="button">Accept</button>
        <GuidedTourCoach lesson={finalLesson} projectId={1} storageKey="k-blur" />
      </>,
    );
    const badge = screen.getByRole("button", { name: "Accept" });
    badge.focus();
    fireEvent.click(badge);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(document.activeElement).not.toBe(badge);
  });
});
