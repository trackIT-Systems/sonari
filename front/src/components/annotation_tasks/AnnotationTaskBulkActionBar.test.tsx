import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The tag panels search tags on the server; a stand-in is enough here.
vi.mock("@/components/tags/TagSearchBar", () => ({
  default: () => <input aria-label="tag search" />,
}));

import AnnotationTaskBulkActionBar from "./AnnotationTaskBulkActionBar";

function mutation() {
  return { mutate: vi.fn(), isPending: false } as any;
}

function renderBar(props: { targetMode: "selected" | "filter_all"; selectedTaskIds?: number[] }) {
  const bulkAddBadge = mutation();
  const bulkRemoveBadge = mutation();
  render(
    <AnnotationTaskBulkActionBar
      targetMode={props.targetMode}
      selectedTaskIds={props.selectedTaskIds ?? []}
      filterTotal={25}
      currentPageTaskIds={[]}
      soundEventTagCounts={[]}
      bulkAddBadge={bulkAddBadge}
      bulkRemoveBadge={bulkRemoveBadge}
      bulkAddTag={mutation()}
      bulkReplaceSoundEventTags={mutation()}
      bulkDeleteSoundEventsByTag={mutation()}
      onClearSelection={() => {}}
    />,
  );
  return { bulkAddBadge, bulkRemoveBadge };
}

describe("AnnotationTaskBulkActionBar confirmation", () => {
  afterEach(cleanup);

  it("names the action and only confirms once the task count is typed", async () => {
    const { bulkAddBadge } = renderBar({ targetMode: "filter_all" });

    await act(async () => {
      fireEvent.click(screen.getByTitle("Accepted (1)"));
    });

    expect(
      await screen.findByText(
        'Set the status "Accepted" on all 25 tasks matching the current filter.',
      ),
    ).toBeTruthy();
    const confirm = screen.getByRole("button", { name: "Set Accepted" }) as HTMLButtonElement;
    const input = screen.getByLabelText("Number of tasks");

    fireEvent.change(input, { target: { value: "24" } });
    expect(confirm.disabled).toBe(true);
    expect(bulkAddBadge.mutate).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "25" } });
    expect(confirm.disabled).toBe(false);
    await act(async () => {
      fireEvent.click(confirm);
    });
    expect(bulkAddBadge.mutate).toHaveBeenCalledWith(
      { annotation_task_ids: undefined, state: "completed" },
      expect.anything(),
    );
  });

  it("runs small selections without asking", () => {
    const { bulkAddBadge } = renderBar({ targetMode: "selected", selectedTaskIds: [1, 2] });

    fireEvent.click(screen.getByTitle("Accepted (1)"));

    expect(bulkAddBadge.mutate).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText("Number of tasks")).toBeNull();
  });
});

describe("AnnotationTaskBulkActionBar status removal", () => {
  afterEach(cleanup);

  it("removes a status with Shift + its number, whatever the layout prints", () => {
    const { bulkAddBadge, bulkRemoveBadge } = renderBar({
      targetMode: "selected",
      selectedTaskIds: [1, 2],
    });

    // Shift + 4 on a German layout prints "$".
    fireEvent.keyDown(window, { key: "$", code: "Digit4", shiftKey: true });

    expect(bulkRemoveBadge.mutate).toHaveBeenCalledWith(
      { annotation_task_ids: [1, 2], state: "verified" },
      expect.anything(),
    );
    expect(bulkAddBadge.mutate).not.toHaveBeenCalled();
  });

  it("asks before removing from every task matching the filter", async () => {
    const { bulkRemoveBadge } = renderBar({ targetMode: "filter_all" });

    await act(async () => {
      fireEvent.keyDown(window, { key: "!", code: "Digit1", shiftKey: true });
    });

    expect(
      await screen.findByText(
        'Remove the status "Accepted" (of every user) from all 25 tasks matching the current filter. Tasks without it are skipped.',
      ),
    ).toBeTruthy();
    expect(bulkRemoveBadge.mutate).not.toHaveBeenCalled();
  });
});
