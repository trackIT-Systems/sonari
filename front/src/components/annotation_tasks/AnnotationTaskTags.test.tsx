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
    expect(screen.getByText("Sound event tags")).toBeTruthy();
  });

  describe("headless (full page view)", () => {
    it("drops the card and tag list", () => {
      render(<AnnotationTaskTags annotationTask={task} headless />);
      expect(screen.queryByText("Sound event tags")).toBeNull();
      expect(screen.queryByText("Myotis")).toBeNull();
    });

    it("keeps the action triggers mounted but invisible", () => {
      render(<AnnotationTaskTags annotationTask={task} headless />);
      const add = screen.getByRole("button", { name: "Add", hidden: true });
      expect(add.closest(".invisible")).not.toBeNull();
    });

    it("opens the menu centred above the page from the keyboard shortcut", async () => {
      render(<AnnotationTaskTags annotationTask={task} headless />);
      pressKey("a");

      const dialog = await screen.findByRole("dialog", { name: "Sound event tags" });
      const search = await screen.findByLabelText("tag search");
      expect(dialog.contains(search)).toBe(true);
      // Rendered at the page root, not inside the invisible trigger row.
      expect(search.closest(".invisible")).toBeNull();
    });
  });

  describe("tag bar on the page", () => {
    // jsdom has no layout: mark the copies "on screen" via getClientRects.
    function onScreen(element: HTMLElement | null, visible: boolean) {
      if (element) element.getClientRects = () => ({ length: visible ? 1 : 0 }) as DOMRectList;
    }

    it("a shortcut opens one centred menu, Esc closes it", async () => {
      const { container } = render(<AnnotationTaskTags annotationTask={task} />);
      onScreen(container.firstElementChild as HTMLElement, true);

      pressKey("a");
      expect(await screen.findByRole("dialog", { name: "Sound event tags" })).toBeTruthy();

      pressKey("Escape");
      expect(screen.queryByRole("dialog", { name: "Sound event tags" })).toBeNull();
    });

    it("only the copy on screen reacts (layouts mount hidden copies too)", async () => {
      const shown = render(<AnnotationTaskTags annotationTask={task} />);
      const hidden = render(<AnnotationTaskTags annotationTask={task} />);
      onScreen(shown.container.firstElementChild as HTMLElement, true);
      onScreen(hidden.container.firstElementChild as HTMLElement, false);

      pressKey("r");
      await screen.findByRole("dialog", { name: "Sound event tags" });
      expect(screen.getAllByRole("dialog", { name: "Sound event tags" })).toHaveLength(1);
    });
  });
});
