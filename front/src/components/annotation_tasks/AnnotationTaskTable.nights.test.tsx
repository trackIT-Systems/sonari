import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AnnotationTaskTable from "@/components/annotation_tasks/AnnotationTaskTable";

// Two nights of three tasks each, and one task without a recording date
const NIGHTS: Record<string, number[]> = { "2026-06-14": [1, 2, 3], "2026-06-15": [4, 5, 6], none: [7] };
const nightOf = (id: number) => Object.keys(NIGHTS).find((key) => NIGHTS[key].includes(id))!;

// Recording times (UTC) inside each night of the fixture, whatever the UTC offset
// (the evening at 22:00 UTC is in the night of its date from UTC-10 to UTC+14)
const recordedAt = (id: number) => {
  const night = nightOf(id);
  if (night === "none") return { date: null, time: null };
  return { date: new Date(`${night}T00:00:00Z`), time: "22:00:00" };
};

const task = (id: number) => ({
  id,
  annotation_project_id: 1,
  recording_id: id,
  start_time: 0,
  end_time: 1,
  recording: { id, path: `rec_${id}.wav`, channels: 1, samplerate: 384000, duration: 10, ...recordedAt(id) },
  tags: [],
  sound_event_tags: [],
  notes: [],
  status_badges: [],
});

const getNights = vi.fn();
const getNightStats = vi.fn();
const getMany = vi.fn();
const getIndex = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

vi.mock("@/app/api", () => ({
  default: {
    annotationTasks: {
      getNights: (...args: unknown[]) => getNights(...args),
      getNightStats: (...args: unknown[]) => getNightStats(...args),
      getMany: (...args: unknown[]) => getMany(...args),
      getIndex: (...args: unknown[]) => getIndex(...args),
      getStats: async () => ({ total: 7 }),
      bulkSoundEventTagSummary: async () => [],
    },
    spectrograms: {
      getBlob: async () => {
        throw new Error("offline");
      },
    },
  },
}));

vi.mock("@/app/loading", () => ({ default: () => <div>loading</div> }));
vi.mock("@/components/inputs/Search", () => ({
  default: ({ onKeyDown }: { onKeyDown?: (e: unknown) => void }) => (
    <input aria-label="search" onKeyDown={onKeyDown} />
  ),
}));
vi.mock("@/components/filters/FilterMenu", () => ({ default: () => null }));
vi.mock("@/components/filters/FilterPresets", () => ({ default: () => null }));
vi.mock("@/components/filters/FilterBar", () => ({ default: () => null }));
vi.mock("@/components/lists/Pagination", () => ({ default: () => null }));
vi.mock("@/components/annotation_tasks/AnnotationTaskSpectrogramPreview", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/annotation_tasks/AnnotationTaskSpectrogramPreview")>()),
  default: ({ task }: { task: { id: number } }) => <div data-testid={`preview-${task.id}`} />,
}));

// The list view: all seven tasks on one page, sorted as `listSortBy` says
let listSortBy: string | undefined;
// The table's current filter (as set in the filter bar)
let currentFilter: Record<string, unknown> = {};
vi.mock("@/hooks/api/useAnnotationTasks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/api/useAnnotationTasks")>()),
  default: () => ({
    isLoading: false,
    data: {},
    items: [1, 2, 3, 4, 5, 6, 7].map(task),
    total: 7,
    pagination: { page: 0, pageSize: 100 },
    filter: { filter: currentFilter, get: (key: string) => (key === "sort_by" ? listSortBy : undefined), set: () => {} },
  }),
}));

const nightTotal = (key: string) => ({ night: key === "none" ? null : key, total: NIGHTS[key].length });
const nightSummary = (key: string) => ({
  night: key === "none" ? null : key,
  total: NIGHTS[key].length,
  done_count: 1,
  pending_count: NIGHTS[key].length - 1,
  verified_count: 0,
  rejected_count: 0,
  completed_count: 1,
  assigned_count: 0,
});

beforeEach(() => {
  window.localStorage.setItem("annotationTasks:view", "nights");
  listSortBy = undefined;
  currentFilter = {};
  vi.spyOn(console, "warn").mockImplementation(() => {});
  getNights.mockReset().mockResolvedValue({
    items: Object.keys(NIGHTS).map(nightTotal),
    total: 3,
    limit: 50,
    offset: 0,
  });
  getNightStats
    .mockReset()
    .mockImplementation(async (_filter: unknown, { nights }: { nights: string[] }) => nights.map(nightSummary));
  getMany
    .mockReset()
    .mockImplementation(async (query: { recording_night: { night: string }; limit: number; offset: number }) => {
      const ids = NIGHTS[query.recording_night.night];
      const items = ids.slice(query.offset, query.offset + query.limit).map(task);
      return { items, total: ids.length, limit: query.limit, offset: query.offset };
  });
  getIndex.mockReset().mockImplementation(async (query: { recording_night: { night: string } }) => ({
    items: NIGHTS[query.recording_night.night].map((id) => ({ id, recording_id: id, start_time: 0 })),
    total: 0,
  }));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderTable() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AnnotationTaskTable filter={{}} />
    </QueryClientProvider>,
  );
}

const header = (key: string) => document.querySelector<HTMLElement>(`tr[data-night-key="${key}"]`)!;
const taskRows = () =>
  Array.from(document.querySelectorAll<HTMLElement>("tr[data-row-id]")).map((tr) => Number(tr.dataset.rowId));
/** Night headers and task rows from top to bottom */
const layout = () =>
  Array.from(document.querySelectorAll<HTMLElement>("tr[data-night-key], tr[data-row-id]")).map((tr) =>
    tr.dataset.nightKey != null ? `night ${tr.dataset.nightKey}` : Number(tr.dataset.rowId),
  );
const checkedTasks = () =>
  taskRows().filter((id) =>
    document.querySelector<HTMLInputElement>(`tr[data-row-id="${id}"] input[type=checkbox]`)!.checked,
  );
const current = () =>
  Array.from(document.querySelectorAll<HTMLElement>("tr[data-night-key]"))
    .filter((tr) => tr.className.includes("bg-emerald-100"))
    .map((tr) => tr.dataset.nightKey);
const key = (k: string, init: KeyboardEventInit = {}) => {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, ...init }));
  });
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keyup", { key: k, bubbles: true, ...init }));
  });
};

async function ready() {
  renderTable();
  await waitFor(() => expect(header("2026-06-14")).toBeTruthy());
}

describe("tasks grouped by night", () => {
  it("lists every night collapsed, with its counts, and loads no tasks", async () => {
    await ready();
    expect(layout()).toEqual(["night 2026-06-14", "night 2026-06-15", "night none"]);
    expect(header("2026-06-14").textContent).toContain("3 tasks");
    // The status counts follow, in one request for the page's nights
    await waitFor(() => expect(header("2026-06-14").textContent).toContain("1 done"));
    expect(getNightStats).toHaveBeenCalledTimes(1);
    expect(getNightStats.mock.calls[0][1]).toMatchObject({ nights: ["2026-06-14", "2026-06-15", "none"] });
    expect(header("2026-06-14").textContent).toContain("2 pending");
    expect(header("none").textContent).toContain("No recording date");
    expect(getMany).not.toHaveBeenCalled();
    expect(getNights.mock.calls[0][1]).toMatchObject({ utcOffset: -new Date().getTimezoneOffset() });
  });

  it("clicking a night loads and shows its tasks under it, and collapses it again", async () => {
    await ready();
    fireEvent.click(header("2026-06-15"));
    await waitFor(() => expect(taskRows()).toEqual([4, 5, 6]));
    expect(layout()).toEqual(["night 2026-06-14", "night 2026-06-15", 4, 5, 6, "night none"]);
    expect(getMany).toHaveBeenCalledTimes(1);
    expect(getMany.mock.calls[0][0]).toMatchObject({ recording_night: { night: "2026-06-15" }, limit: 100, offset: 0 });

    fireEvent.click(header("2026-06-15"));
    expect(taskRows()).toEqual([]);
  });

  it("the arrow keys walk headers and tasks; → expands, ← collapses", async () => {
    await ready();
    fireEvent.keyDown(screen.getByLabelText("search"), { key: "ArrowDown" });
    expect(current()).toEqual(["2026-06-14"]);

    key("ArrowRight");
    await waitFor(() => expect(taskRows()).toEqual([1, 2, 3]));
    key("ArrowDown");
    expect(current()).toEqual([]);
    expect(checkedTasks()).toEqual([1]); // the cursor's row is ticked
    key("ArrowDown");
    key("ArrowDown");
    key("ArrowDown");
    expect(current()).toEqual(["2026-06-15"]);

    key("ArrowUp");
    expect(checkedTasks()).toEqual([3]);
    // ← on a task collapses its night; the cursor goes to the header
    key("ArrowLeft");
    expect(taskRows()).toEqual([]);
    expect(current()).toEqual(["2026-06-14"]);
  });

  it("keeps the cursor on its task when a night above expands", async () => {
    await ready();
    fireEvent.click(header("2026-06-15"));
    await waitFor(() => expect(taskRows()).toEqual([4, 5, 6]));
    fireEvent.click(document.querySelector('tr[data-row-id="5"] td:nth-child(3)')!);
    expect(checkedTasks()).toEqual([5]);

    fireEvent.click(header("2026-06-14"));
    await waitFor(() => expect(taskRows()).toEqual([1, 2, 3, 4, 5, 6]));
    // Clicking the header moved the cursor there; ↓ ↓ ↓ ↓ ↓ reaches task 4, not a shifted index
    for (let i = 0; i < 5; i++) key("ArrowDown");
    expect(checkedTasks()).toEqual([4]);
  });

  it("ticking a collapsed night ticks all its tasks", async () => {
    await ready();
    // Looked up each time: the header row moves (and is recreated) when its night expands
    const box = () => header("2026-06-14").querySelector<HTMLInputElement>("input[type=checkbox]")!;
    fireEvent.click(box());
    await waitFor(() => expect(box().checked).toBe(true));
    expect(getIndex.mock.calls[0][0]).toMatchObject({ recording_night: { night: "2026-06-14" } });
    expect(screen.getByText(/3 selected/i)).toBeTruthy();

    // Expanded, its tasks show ticked
    fireEvent.click(header("2026-06-14"));
    await waitFor(() => expect(checkedTasks()).toEqual([1, 2, 3]));
    expect(box().checked).toBe(true);

    // Unticking one leaves the night partly ticked
    fireEvent.click(document.querySelector<HTMLInputElement>('tr[data-row-id="2"] input[type=checkbox]')!);
    expect(checkedTasks()).toEqual([1, 3]);
    expect(box().checked).toBe(false);
    expect(box().indeterminate).toBe(true);

    // Ticking the night again ticks the rest
    fireEvent.click(box());
    await waitFor(() => expect(checkedTasks()).toEqual([1, 2, 3]));
  });

  it("a Shift tap on a night header ticks the whole night", async () => {
    await ready();
    fireEvent.keyDown(screen.getByLabelText("search"), { key: "ArrowDown" });
    key("ArrowDown");
    expect(current()).toEqual(["2026-06-15"]);
    key("Shift");
    const box = header("2026-06-15").querySelector<HTMLInputElement>("input[type=checkbox]")!;
    await waitFor(() => expect(box.checked).toBe(true));
  });

  it("a big night shows 100 tasks at a time, and ticking it ticks every task", async () => {
    const big = Array.from({ length: 150 }, (_, i) => 100 + i);
    const original = NIGHTS["2026-06-15"];
    NIGHTS["2026-06-15"] = big;
    getNights.mockResolvedValue({ items: Object.keys(NIGHTS).map(nightSummary), total: 3, limit: 50, offset: 0 });
    try {
      await ready();
      fireEvent.click(header("2026-06-15"));
      await waitFor(() => expect(taskRows()).toHaveLength(100));
      const more = () => document.querySelector<HTMLElement>('tr[data-night-more="2026-06-15"]');
      // Right under the night's tasks, before the next night
      expect(layout().slice(-2)).toEqual([199, "night none"]);
      expect(more()!.previousElementSibling).toBe(document.querySelector('tr[data-row-id="199"]'));
      expect(more()!.textContent).toContain("100 of 150");

      // Not all of its tasks are loaded: the header ticks them all from the index
      fireEvent.click(header("2026-06-15").querySelector("input")!);
      await waitFor(() => expect(checkedTasks()).toHaveLength(100));
      expect(getIndex).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByText(/Show more/));
      await waitFor(() => expect(taskRows()).toHaveLength(150));
      expect(getMany.mock.calls.at(-1)![0]).toMatchObject({ limit: 100, offset: 100 });
      expect(more()).toBeNull();
      expect(checkedTasks()).toHaveLength(150);

      // Collapsing forgets the extra pages
      fireEvent.click(header("2026-06-15"));
      expect(taskRows()).toEqual([]);
      fireEvent.click(header("2026-06-15"));
      await waitFor(() => expect(taskRows()).toHaveLength(100));
    } finally {
      NIGHTS["2026-06-15"] = original;
    }
  });

  it("switching to the list view shows the plain list with night dividers", async () => {
    await ready();
    fireEvent.click(screen.getByRole("radio", { name: "List" }));
    expect(document.querySelector("tr[data-night-key]")).toBeNull();
    expect(taskRows()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(window.localStorage.getItem("annotationTasks:view")).toBe("list");
    expect(dividers()).toEqual(["2026-06-14", "2026-06-15", "none"]);
  });

  it("lists the nights under the cheap filters only, and counts the whole filter per night", async () => {
    const project = { id: 1 };
    const tag = { key: "species", value: "Myotis" };
    currentFilter = { annotation_project: project, sound_event_annotation_tag: tag };
    // Only task 2 of the first night has the tag; none of the second night
    getNightStats.mockImplementation(async (_filter: unknown, { nights }: { nights: string[] }) =>
      nights.map((key) => ({
        ...nightSummary(key),
        total: key === "2026-06-14" ? 1 : 0,
        done_count: 0,
        completed_count: 0,
        pending_count: key === "2026-06-14" ? 1 : 0,
      })),
    );
    await ready();
    // Listed by the project alone; the tag filter runs per night
    expect(getNights.mock.calls[0][0]).toEqual({ annotation_project: project });
    expect(getNightStats.mock.calls[0][0]).toEqual(currentFilter);
    await waitFor(() => expect(header("2026-06-14").textContent).toContain("1 of 3 tasks match"));
    expect(header("2026-06-15").textContent).toContain("0 of 3 tasks match");

    // A night without matches doesn't expand or tick
    expect(header("2026-06-15").getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(header("2026-06-15"));
    fireEvent.click(header("2026-06-15").querySelector("input[type=checkbox]")!);
    expect(getMany).not.toHaveBeenCalled();
    expect(getIndex).not.toHaveBeenCalled();

    fireEvent.click(header("2026-06-14"));
    await waitFor(() => expect(getMany).toHaveBeenCalledTimes(1));
    expect(getMany.mock.calls[0][0]).toMatchObject({
      sound_event_annotation_tag: tag,
      recording_night: { night: "2026-06-14" },
    });
  });

  it("nightOf helper matches the fixture", () => {
    expect(nightOf(5)).toBe("2026-06-15");
  });
});

const dividers = () =>
  Array.from(document.querySelectorAll<HTMLElement>("tr[data-night-divider]")).map((row) => row.dataset.nightDivider);

describe("AnnotationTaskTable list view", () => {
  beforeEach(() => {
    window.localStorage.removeItem("annotationTasks:view");
  });

  it("is the default: the page of tasks with a divider where each night starts", async () => {
    renderTable();
    await waitFor(() => expect(document.querySelectorAll("tr[data-row-id]")).toHaveLength(7));
    expect(getNights).not.toHaveBeenCalled();
    expect(dividers()).toEqual(["2026-06-14", "2026-06-15", "none"]);
    // Each divider sits right before the night's first task
    const first = document.querySelector("tr[data-night-divider='2026-06-15']")!;
    expect((first.nextElementSibling as HTMLElement).dataset.rowId).toBe("4");
    expect(first.textContent).toContain("3 tasks on this page");
  });

  it("shows no dividers when sorted by something other than recording time", async () => {
    listSortBy = "-duration";
    renderTable();
    await waitFor(() => expect(document.querySelectorAll("tr[data-row-id]")).toHaveLength(7));
    expect(dividers()).toEqual([]);
  });
});
