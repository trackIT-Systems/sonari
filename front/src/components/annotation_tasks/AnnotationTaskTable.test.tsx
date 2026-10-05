import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AnnotationTaskTable from "@/components/annotation_tasks/AnnotationTaskTable";

const push = vi.fn();
const bulkAddBadge = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

vi.mock("@/app/api", () => ({
  default: {
    annotationTasks: {
      getIndex: async () => ({ items: [] }),
      bulkSoundEventTagSummary: async () => [],
      bulkAddBadge: (...args: unknown[]) => bulkAddBadge(...args),
    },
  },
}));

vi.mock("@/app/loading", () => ({ default: () => <div>loading</div> }));
vi.mock("@/components/inputs/Search", () => ({ default: () => <input aria-label="search" /> }));
vi.mock("@/components/filters/FilterMenu", () => ({ default: () => null }));
vi.mock("@/components/filters/FilterPresets", () => ({ default: () => null }));
vi.mock("@/components/filters/FilterBar", () => ({ default: () => null }));
vi.mock("@/components/lists/Pagination", () => ({ default: () => null }));
vi.mock("@/components/annotation_tasks/AnnotationTaskSpectrogramPreview", () => ({
  default: ({ task }: { task: { id: number } }) => (
    <div data-testid={`preview-${task.id}`}>preview {task.id}</div>
  ),
}));

const N = 12;
const tasks = Array.from({ length: N }, (_, i) => ({
  id: i + 1,
  annotation_project_id: 1,
  recording_id: i + 1,
  start_time: 0,
  end_time: 1,
  recording: { id: i + 1, path: `rec_${i + 1}.wav`, channels: 1, samplerate: 384000, duration: 10 },
  tags: [],
  sound_event_tags: [],
  notes: [],
  status_badges: [],
}));

vi.mock("@/hooks/api/useAnnotationTasks", () => ({
  default: () => ({
    isLoading: false,
    data: {},
    items: tasks,
    total: tasks.length,
    pagination: { page: 0, pageSize: 100 },
    filter: { filter: {}, get: () => undefined, set: () => {} },
  }),
}));

// ---- helpers --------------------------------------------------------------

const keyEvent = (type: "keydown" | "keyup", key: string, init: KeyboardEventInit = {}) =>
  window.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true, ...init }));

/** A normal key tap: keydown followed by keyup. */
function press(key: string, init: KeyboardEventInit = {}) {
  // Separate renders: react-use's key hooks track "pressed" state between them
  act(() => keyEvent("keydown", key, init));
  act(() => keyEvent("keyup", key, init));
}

/**
 * Holding keys: keydown events repeat with no keyup in between (browser
 * auto-repeat), all in one React batch, i.e. faster than re-rendering.
 */
function holdKeys(keys: string[]) {
  act(() => {
    keys.forEach((key, i) => keyEvent("keydown", key, { repeat: i > 0 }));
  });
  act(() => {
    new Set(keys).forEach((key) => keyEvent("keyup", key));
  });
}

/** Holding one key with a re-render between every auto-repeat event. */
function holdKeyWithRenders(key: string, times: number) {
  for (let i = 0; i < times; i++) act(() => keyEvent("keydown", key, { repeat: i > 0 }));
  act(() => keyEvent("keyup", key));
}

const row = (id: number) => document.querySelector<HTMLElement>(`tr[data-row-id="${id}"]`)!;
const preview = (id: number) => screen.queryByTestId(`preview-${id}`);
const openPreviews = () =>
  tasks.map((t) => t.id).filter((id) => preview(id) != null);
const checked = () =>
  tasks
    .map((t) => t.id)
    .filter((id) => row(id).querySelector<HTMLInputElement>("input[type=checkbox]")!.checked);
const clickRow = (id: number) => fireEvent.click(row(id).querySelector("td:nth-child(3)")!);
const highlighted = () =>
  tasks.map((t) => t.id).filter((id) => row(id).className.includes("bg-stone-200 dark:bg-stone-800"));

function renderTable() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AnnotationTaskTable filter={{}} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  push.mockClear();
  bulkAddBadge.mockReset().mockResolvedValue({
    tasks_updated: 1, tasks_skipped: 0, sound_events_updated: 0,
    sound_events_skipped: 0, failures: [],
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ---- tests ----------------------------------------------------------------

describe("preview toggling", () => {
  it("opens and closes a preview on row click", () => {
    renderTable();
    clickRow(1);
    expect(openPreviews()).toEqual([1]);
    clickRow(1);
    expect(openPreviews()).toEqual([]);
  });

  it("keeps at most 5 previews open, dropping the oldest", () => {
    renderTable();
    [1, 2, 3, 4, 5, 6].forEach(clickRow);
    expect(openPreviews()).toEqual([2, 3, 4, 5, 6]);
  });
});

describe("arrow navigation", () => {
  it("moves the highlight and expands the current row, collapsing the previous nav preview", () => {
    renderTable();
    clickRow(1); // pinned by click
    press("ArrowDown");
    expect(highlighted()).toEqual([2]);
    expect(openPreviews()).toEqual([1, 2]);
    press("ArrowDown");
    expect(highlighted()).toEqual([3]);
    expect(openPreviews()).toEqual([1, 3]); // 2 was only navigated through
  });

  it("ArrowUp moves back and expands that row", () => {
    renderTable();
    clickRow(4);
    press("ArrowUp");
    expect(highlighted()).toEqual([3]);
    expect(openPreviews()).toContain(3);
  });

  // KNOWN BUG (found by these tests): the table moves its highlight through
  // react-use's useKeyPressEvent, which fires once per press (edge-triggered:
  // auto-repeat keydowns without a keyup are ignored). The preview/scroll
  // handler is a plain keydown listener, so while an arrow key is held the
  // preview and scroll keep advancing but the highlight (and Shift selection)
  // does not. Batched events also read stale state.
  // Fix: one cursor in a ref and one keydown handler for everything.
  it.fails("holding the key with a re-render between repeats moves one row per repeat", () => {
    renderTable();
    clickRow(1);
    holdKeyWithRenders("ArrowDown", 4);
    expect(highlighted()).toEqual([5]);
  });

  it.fails("holding the key (several events before a re-render) still advances one row per event", () => {
    renderTable();
    clickRow(1);
    holdKeys(["ArrowDown", "ArrowDown", "ArrowDown", "ArrowDown"]);
    expect(highlighted()).toEqual([5]);
    expect(openPreviews()).toContain(5);
  });

  it.fails("holding the key never leaves more than the pinned row plus the current one open", () => {
    renderTable();
    clickRow(1);
    for (let i = 0; i < 6; i++) holdKeys(["ArrowDown", "ArrowDown"]);
    expect(openPreviews().length).toBeLessThanOrEqual(2);
    expect(highlighted()).toEqual([N]); // clamped at the last row
  });
});

describe("Shift selection", () => {
  it("toggles the checkbox of the current expanded row", () => {
    renderTable();
    clickRow(1);
    press("Shift");
    expect(checked()).toEqual([1]);
    press("Shift");
    expect(checked()).toEqual([]);
  });

  it("ignores key auto-repeat of Shift", () => {
    renderTable();
    clickRow(1);
    press("Shift");
    press("Shift", { repeat: true });
    expect(checked()).toEqual([1]);
  });

  it("selects the row reached by arrow navigation", () => {
    renderTable();
    clickRow(1);
    press("ArrowDown");
    press("Shift");
    expect(checked()).toEqual([2]);
  });

  // KNOWN BUG, same cause: Shift reads the current row from stale state.
  it.fails("selects the right row when arrow and Shift arrive in the same batch", () => {
    renderTable();
    clickRow(1);
    holdKeys(["ArrowDown", "Shift"]);
    expect(checked()).toEqual([2]);
  });

  it("does nothing when no row is current", () => {
    renderTable();
    press("Shift");
    expect(checked()).toEqual([]);
  });

  it("Escape drops the selection", () => {
    renderTable();
    clickRow(1);
    press("Shift");
    expect(checked()).toEqual([1]);
    press("Escape");
    expect(checked()).toEqual([]);
  });
});

describe("bulk shortcuts", () => {
  it("with a selection, 1 sets the status instead of opening a task", async () => {
    renderTable();
    clickRow(1);
    press("Shift");
    press("1");
    await waitFor(() => expect(bulkAddBadge).toHaveBeenCalled());
    expect(bulkAddBadge.mock.calls[0][0]).toMatchObject({
      annotation_task_ids: [1],
      state: "completed",
    });
    expect(push).not.toHaveBeenCalled();
  });

  it("without a selection, 1 opens the first task", () => {
    renderTable();
    press("1");
    expect(push).toHaveBeenCalledTimes(1);
    expect(bulkAddBadge).not.toHaveBeenCalled();
  });

  it("opens the replace panel with r", async () => {
    renderTable();
    clickRow(1);
    press("Shift");
    press("r");
    await waitFor(() => expect(screen.queryByText(/Loading tags/i) ?? document.querySelector("[data-headlessui-state~=open]")).toBeTruthy());
  });
});

describe("scrolling the current row into view", () => {
  function setupLayout({ rowHeight = 40, previewHeight = 190, viewTop = 0, viewHeight = 400 } = {}) {
    const scroller = document.createElement("div");
    scroller.style.overflowY = "auto";
    Object.defineProperty(scroller, "scrollHeight", { value: 5000, configurable: true });
    Object.defineProperty(scroller, "clientHeight", { value: viewHeight, configurable: true });
    const scrollBy = vi.fn();
    scroller.scrollBy = scrollBy as unknown as typeof scroller.scrollBy;
    scroller.getBoundingClientRect = () =>
      ({ top: viewTop, bottom: viewTop + viewHeight, height: viewHeight, left: 0, right: 0, width: 0 }) as DOMRect;

    const client = new QueryClient();
    const utils = render(
      <QueryClientProvider client={client}>
        <AnnotationTaskTable filter={{}} />
      </QueryClientProvider>,
      { container: document.body.appendChild(scroller) },
    );

    // Lay rows out top to bottom, adding the preview height under expanded rows.
    const layout = () => {
      let y = viewTop - 0; // scrollTop is 0 in this fake layout
      const rects = new Map<Element, { top: number; bottom: number }>();
      document.querySelectorAll("tbody > tr").forEach((tr) => {
        const h = (tr as HTMLElement).dataset.expandedRowFor ? previewHeight : rowHeight;
        rects.set(tr, { top: y, bottom: y + h });
        y += h;
      });
      return rects;
    };
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const r = layout().get(this);
      return (r ? { ...r, height: r.bottom - r.top, left: 0, right: 0, width: 0 } : { top: 0, bottom: 0, height: 0, left: 0, right: 0, width: 0 }) as DOMRect;
    });
    return { scrollBy, ...utils };
  }

  it("does not scroll while the row and preview are visible", () => {
    const { scrollBy } = setupLayout({ viewHeight: 1200 });
    clickRow(1);
    press("ArrowDown");
    press("ArrowDown");
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("scrolls down when the preview of the current row would be cut off at the bottom", () => {
    const { scrollBy } = setupLayout();
    clickRow(1);
    for (let i = 0; i < 6; i++) press("ArrowDown");
    expect(scrollBy).toHaveBeenCalled();
    const total = scrollBy.mock.calls.reduce((sum, [arg]) => sum + (arg as { top: number }).top, 0);
    expect(total).toBeGreaterThan(0);
  });
});

describe("drag selection", () => {
  const rowHeight = 40;
  function mockHitTest() {
    // Rows are laid out 40px apart starting at y=0; rows map to ids 1..N.
    (document as unknown as { elementsFromPoint: (x: number, y: number) => Element[] }).elementsFromPoint = (
      _x: number,
      y: number,
    ) => {
      const id = Math.floor(y / rowHeight) + 1;
      const el = row(id);
      return el ? [el] : [];
    };
  }
  const tick = () => act(() => new Promise<void>((r) => setTimeout(r, 40)));

  it("selects the range between mousedown row and the row under the pointer", async () => {
    renderTable();
    mockHitTest();
    fireEvent.mouseDown(row(2).querySelector("td:nth-child(3)")!, { button: 0, clientX: 5, clientY: 2 * rowHeight + 5 - rowHeight });
    fireEvent.mouseMove(window, { clientX: 5, clientY: 4 * rowHeight + 5 }); // row 5
    await tick();
    expect(checked()).toEqual([2, 3, 4, 5]);
    fireEvent.mouseMove(window, { clientX: 5, clientY: 2 * rowHeight + 5 }); // back to row 3
    await tick();
    expect(checked()).toEqual([2, 3]);
    fireEvent.mouseUp(window);
  });

  it("does not toggle a preview after a drag, but does for a plain click", async () => {
    renderTable();
    mockHitTest();
    const cell = row(1).querySelector("td:nth-child(3)")!;
    fireEvent.mouseDown(cell, { button: 0, clientX: 5, clientY: 5 });
    fireEvent.mouseMove(window, { clientX: 5, clientY: 2 * rowHeight + 5 });
    await tick();
    fireEvent.mouseUp(window);
    fireEvent.click(cell);
    expect(openPreviews()).toEqual([]);
    await act(() => new Promise<void>((r) => setTimeout(r, 10)));

    clickRow(1);
    expect(openPreviews()).toEqual([1]);
  });

  it("starting on a selected row deselects the dragged range", async () => {
    renderTable();
    mockHitTest();
    const drag = async (fromId: number, toId: number) => {
      fireEvent.mouseDown(row(fromId).querySelector("td:nth-child(3)")!, { button: 0, clientX: 5, clientY: 5 });
      fireEvent.mouseMove(window, { clientX: 5, clientY: (toId - 1) * rowHeight + 5 });
      await tick();
      fireEvent.mouseUp(window);
      await act(() => new Promise<void>((r) => setTimeout(r, 10)));
    };
    await drag(1, 4);
    expect(checked()).toEqual([1, 2, 3, 4]);
    await drag(2, 3); // starts on a selected row -> deselect mode
    expect(checked()).toEqual([1, 4]);
  });

  it("ignores a drag that starts on a checkbox", async () => {
    renderTable();
    mockHitTest();
    const box = row(1).querySelector("input[type=checkbox]")!;
    fireEvent.mouseDown(box, { button: 0, clientX: 5, clientY: 5 });
    fireEvent.mouseMove(window, { clientX: 5, clientY: 3 * rowHeight + 5 });
    await tick();
    fireEvent.mouseUp(window);
    expect(checked()).toEqual([]);
  });
});
