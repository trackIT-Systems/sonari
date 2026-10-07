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
  default: ({
    task,
    pinned,
    deferred,
    onTogglePin,
  }: {
    task: { id: number };
    pinned?: boolean;
    deferred?: boolean;
    onTogglePin?: () => void;
  }) => (
    <div data-testid={`preview-${task.id}`} data-deferred={String(Boolean(deferred))}>
      preview {task.id}
      <button type="button" onClick={onTogglePin}>
        {pinned ? "Pinned" : "Pin"}
      </button>
    </div>
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

describe("active preview", () => {
  it("opens the preview on the clicked row and closes it on a second click", () => {
    renderTable();
    clickRow(1);
    expect(openPreviews()).toEqual([1]);
    clickRow(1);
    expect(openPreviews()).toEqual([]);
  });

  it("moves the one preview to another clicked row instead of opening a second", () => {
    renderTable();
    clickRow(1);
    clickRow(4);
    expect(openPreviews()).toEqual([4]);
    expect(highlighted()).toEqual([4]);
  });

  it("never shows two previews when clicking and arrowing are mixed", () => {
    renderTable();
    press("ArrowDown"); // cursor -1 -> no-op (search owns the first ArrowDown)
    clickRow(3);
    press("ArrowDown");
    press("ArrowDown");
    clickRow(9);
    press("ArrowUp");
    clickRow(2);
    press("ArrowDown");
    expect(openPreviews()).toHaveLength(1);
    expect(openPreviews()).toEqual(highlighted());
  });
});

describe("arrow navigation", () => {
  it("moves the highlight and the preview together", () => {
    renderTable();
    clickRow(1);
    press("ArrowDown");
    expect(highlighted()).toEqual([2]);
    expect(openPreviews()).toEqual([2]);
    press("ArrowDown");
    expect(highlighted()).toEqual([3]);
    expect(openPreviews()).toEqual([3]);
  });

  it("ArrowUp moves back", () => {
    renderTable();
    clickRow(4);
    press("ArrowUp");
    expect(highlighted()).toEqual([3]);
    expect(openPreviews()).toEqual([3]);
  });

  it("ArrowUp on the first row returns to the search box", () => {
    renderTable();
    clickRow(1);
    press("ArrowUp");
    expect(highlighted()).toEqual([]);
    expect(openPreviews()).toEqual([]);
  });

  it("opens a closed preview when moving on", () => {
    renderTable();
    clickRow(1);
    clickRow(1); // close
    press("ArrowDown");
    expect(openPreviews()).toEqual([2]);
  });

  it("holding the key with a re-render between repeats moves one row per repeat", () => {
    renderTable();
    clickRow(1);
    holdKeyWithRenders("ArrowDown", 4);
    expect(highlighted()).toEqual([5]);
    expect(openPreviews()).toEqual([5]);
  });

  it("holding the key (several repeats before a re-render) advances one row per repeat", () => {
    renderTable();
    clickRow(1);
    holdKeys(["ArrowDown", "ArrowDown", "ArrowDown", "ArrowDown"]);
    expect(highlighted()).toEqual([5]);
    expect(openPreviews()).toEqual([5]);
  });

  it("holding the key stops at the last row and keeps a single preview", () => {
    renderTable();
    clickRow(1);
    for (let i = 0; i < 6; i++) holdKeys(["ArrowDown", "ArrowDown"]);
    expect(highlighted()).toEqual([N]);
    expect(openPreviews()).toEqual([N]);
  });

  it("holding ArrowUp walks back up to the first row", () => {
    renderTable();
    clickRow(6);
    holdKeys(["ArrowUp", "ArrowUp", "ArrowUp"]);
    expect(highlighted()).toEqual([3]);
  });
});

describe("loading the active preview", () => {
  it("defers loading while the cursor is moving and loads once it rests", async () => {
    renderTable();
    clickRow(1);
    press("ArrowDown");
    press("ArrowDown");
    expect(preview(3)!.getAttribute("data-deferred")).toBe("true");
    await act(() => new Promise<void>((r) => setTimeout(r, 250)));
    expect(preview(3)!.getAttribute("data-deferred")).toBe("false");
  });

  it("never defers a pinned preview", () => {
    renderTable();
    clickRow(1);
    press("p");
    press("ArrowDown");
    expect(preview(1)!.getAttribute("data-deferred")).toBe("false");
  });
});

describe("pinning previews", () => {
  it("p pins the current preview; it stays when the cursor moves on", () => {
    renderTable();
    clickRow(1);
    press("p");
    press("ArrowDown");
    press("ArrowDown");
    expect(openPreviews()).toEqual([1, 3]);
    expect(highlighted()).toEqual([3]);
  });

  it("p on a pinned current row unpins it", () => {
    renderTable();
    clickRow(1);
    press("p");
    press("ArrowDown");
    press("ArrowUp");
    press("p");
    press("ArrowDown");
    expect(openPreviews()).toEqual([2]);
  });

  it("keeps at most 5 pins, dropping the oldest", () => {
    renderTable();
    clickRow(1);
    for (let i = 0; i < 6; i++) {
      press("p");
      press("ArrowDown");
    }
    // rows 1..6 were pinned; row 7 is the active preview
    expect(openPreviews()).toEqual([2, 3, 4, 5, 6, 7]);
  });

  it("clicking the pin button toggles the pin", () => {
    renderTable();
    clickRow(2);
    fireEvent.click(screen.getByRole("button", { name: "Pin" }));
    press("ArrowDown");
    expect(openPreviews()).toEqual([2, 3]);
  });

  it("clicking the current pinned row closes its preview", () => {
    renderTable();
    clickRow(1);
    press("p");
    clickRow(1);
    expect(openPreviews()).toEqual([]);
  });
});

describe("Shift selection", () => {
  it("toggles the checkbox of the current row", () => {
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

  it("selects the right row when arrow and Shift arrive in the same batch", () => {
    renderTable();
    clickRow(1);
    // Two distinct key presses landing before React re-renders
    act(() => {
      keyEvent("keydown", "ArrowDown");
      keyEvent("keydown", "Shift");
    });
    act(() => {
      keyEvent("keyup", "ArrowDown");
      keyEvent("keyup", "Shift");
    });
    expect(checked()).toEqual([2]);
  });

  it("works on a pinned row whose preview is the only one open there", () => {
    renderTable();
    clickRow(1);
    press("p");
    press("Shift");
    press("ArrowDown");
    press("ArrowUp");
    expect(checked()).toEqual([1]);
  });

  it("does nothing when no row is current", () => {
    renderTable();
    press("Shift");
    expect(checked()).toEqual([]);
  });

  it("does nothing when the current row's preview is closed", () => {
    renderTable();
    clickRow(1);
    clickRow(1); // close
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

  it("without a selection, 1 opens the first task in a new tab", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    renderTable();
    press("1");
    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0][0]).toContain("/annotation_projects/detail/annotation/?annotation_task_id=1");
    expect(open.mock.calls[0][1]).toBe("_blank");
    expect(push).not.toHaveBeenCalled();
    expect(bulkAddBadge).not.toHaveBeenCalled();
  });

  it("Enter on the highlighted row opens the annotate view in a new tab", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    renderTable();
    clickRow(3);
    press("Enter");
    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0][0]).toContain("annotation_task_id=3");
    expect(open.mock.calls[0][1]).toBe("_blank");
  });

  it("the recording link opens in a new tab", () => {
    renderTable();
    const link = row(1).querySelector("a")!;
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
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
