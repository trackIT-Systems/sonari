import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AnnotationTask } from "@/types";

// The add panel searches tags on the server; a stand-in is enough here.
vi.mock("@/components/tags/TagSearchBar", () => ({
  default: () => <input aria-label="tag search" />,
}));

import AnnotationTaskTags from "./AnnotationTaskTags";

const task = {
  id: 1,
  sound_event_annotations: [
    { id: 10, tags: [{ key: "species", value: "Myotis" }] },
  ],
} as unknown as AnnotationTask;

function pressKey(key: string) {
  act(() => {
    fireEvent.keyDown(document.body, { key });
  });
}

describe("AnnotationTaskTags", () => {
  afterEach(cleanup);

  it("renders the tag card normally", () => {
    render(<AnnotationTaskTags annotationTask={task} />);
    expect(screen.getByText("All Sound Event Annotation Tags")).toBeTruthy();
  });

  describe("headless (full page view)", () => {
    it("drops the card and tag list", () => {
      render(<AnnotationTaskTags annotationTask={task} headless />);
      expect(screen.queryByText("All Sound Event Annotation Tags")).toBeNull();
      expect(screen.queryByText("Myotis")).toBeNull();
    });

    it("keeps the action triggers mounted but invisible", () => {
      render(<AnnotationTaskTags annotationTask={task} headless />);
      const add = screen.getByRole("button", { name: "Add", hidden: true });
      expect(add.closest(".invisible")).not.toBeNull();
    });

    it("still opens a visible popover from the keyboard shortcut", async () => {
      render(<AnnotationTaskTags annotationTask={task} headless />);
      pressKey("a");

      const search = await screen.findByLabelText("tag search");
      const panel = search.closest(".visible");
      expect(panel).not.toBeNull();
      // The opted-in panel is the nearest visibility setting above the search
      // field, so the invisible trigger row does not hide it.
      expect(search.closest(".visible, .invisible")).toBe(panel);
    });
  });
});
