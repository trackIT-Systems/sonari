import classNames from "classnames";
import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import AnnotationProjectContext from "@/app/(base)/annotation_projects/detail/context";
import type { RowSelectionState, OnChangeFn } from "@tanstack/react-table";
import { useKeyPressEvent } from "react-use";
import { useQuery } from "@tanstack/react-query";
import api from "@/app/api";
import useKeyFilter from "@/hooks/utils/useKeyFilter";
import type { AnnotationTaskFilter } from "@/api/annotation_tasks";
import type { AnnotationTask } from "@/types";
import useAnnotationTasks from "@/hooks/api/useAnnotationTasks";
import useAnnotationTaskNights, {
  currentUtcOffset,
  nightKey,
  nightOfRecording,
  type NightGroup,
} from "@/hooks/api/useAnnotationTaskNights";
import useAnnotationTaskStats from "@/hooks/api/useAnnotationTaskStats";
import NightHeaderRow, { NightDividerRow, NightMoreRow, type NightTickState } from "@/components/annotation_tasks/NightHeaderRow";
import {
  annotationTaskFilterPersistKey,
  writeAnnotationTaskFilterPersist,
} from "@/hooks/utils/annotationTaskFilterPersistKey";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import useAnnotationTaskTable from "@/hooks/useAnnotationTaskTable";
import useAnnotationTaskBulkActions from "@/hooks/api/useAnnotationTaskBulkActions";
import AnnotationTaskBulkActionBar from "@/components/annotation_tasks/AnnotationTaskBulkActionBar";
import { SOUND_EVENT_TAG_PANELS } from "@/components/annotation_tasks/AnnotationTaskBulkActionBar";
import type { TagBulkPanel } from "@/components/annotation_tasks/AnnotationTaskBulkActionBar";
import Loading from "@/app/loading";
import Search from "@/components/inputs/Search";
import FilterPopover from "@/components/filters/FilterMenu";
import FilterPresets from "@/components/filters/FilterPresets";
import { normalizeDateRangeForPreset } from "@/components/filters/DateRangeFilter";
import tasksFilterDefs from "../filters/tasks";
import FilterBar from "@/components/filters/FilterBar";
import Table from "@/components/tables/Table";
import Pagination from "@/components/lists/Pagination";
import ShortcutHelper from "@/components/ShortcutHelper";
import { getScrollParent } from "@/utils/focus";
import { ANNOTATE_SELECTION_SHORTCUT, PIN_PREVIEW_SHORTCUT, PREVIEW_CHANNEL_SHORTCUT, TASK_TABLE_SHORTCUTS, LIST_OVERVIEW_DOWN_SHORTCUT, SEARCH_BAR_LEAVE_SHORTCUT, FILTER_POPOVER_SHORTCUT } from "@/utils/keyboard";
import AnnotationTaskSpectrogramPreview, {
  getPreviewImageRequest,
  nextPreviewChannel,
  type PreviewChannel,
} from "@/components/annotation_tasks/AnnotationTaskSpectrogramPreview";
import { prefetchImages, type ImageRequest } from "@/utils/spectrogram_images";
import useStore from "@/store";
import { findTemporallyRelatedTasks } from "@/utils/temporalClusters";
import { emitGuidedTourEvent } from "@/components/workshop/guidedTour/events";
import Button from "../Button";
import { FilterIcon, VolumeIcon } from "../icons";
import ReferenceCallsPanel from "@/components/reference_calls/ReferenceCallsPanel";
import usePinnedReferenceSpecies from "@/components/reference_calls/usePinnedReferenceSpecies";
import { includedSpecies } from "@/components/reference_calls/includedSpecies";

/**
 * Scrolls the one real scroll container so a table row (and its expanded
 * preview, if any) is visible, keeping clear of the sticky bulk action bar.
 */
function scrollRowIntoView(taskId: number, topInset: number) {
  const row = document.querySelector<HTMLElement>(`[data-row-id="${taskId}"]`);
  if (!row) return;
  const preview = document.querySelector<HTMLElement>(`[data-expanded-row-for="${taskId}"]`);
  scrollRangeIntoView(row, preview, topInset);
}

/** Like `scrollRowIntoView`, for the header row of a night */
function scrollNightIntoView(night: string, topInset: number) {
  const row = document.querySelector<HTMLElement>(`tr[data-night-key="${night}"]`);
  if (row) scrollRangeIntoView(row, null, topInset);
}

function scrollRangeIntoView(row: HTMLElement, preview: HTMLElement | null, topInset: number) {

  const container = getScrollParent(row);
  const viewTop = container ? container.getBoundingClientRect().top : 0;
  const viewBottom = container
    ? container.getBoundingClientRect().bottom
    : window.innerHeight;

  const rowTop = row.getBoundingClientRect().top;
  const bottom = (preview ?? row).getBoundingClientRect().bottom;
  const minTop = viewTop + topInset;
  const maxBottom = viewBottom - 16;

  let delta = 0;
  if (rowTop < minTop) {
    delta = rowTop - minTop;
  } else if (bottom > maxBottom) {
    // Bring the preview into view, but never push the row itself off the top
    delta = Math.min(bottom - maxBottom, rowTop - minTop);
  }
  if (delta === 0) return;
  if (container) container.scrollBy({ top: delta });
  else window.scrollBy({ top: delta });
}

/** Maximum number of pinned spectrogram previews (the oldest pin is dropped) */
const MAX_PINNED_PREVIEWS = 5;
/** The active preview only loads once the cursor has rested this long (holding an arrow key) */
const PREVIEW_SETTLE_MS = 150;
/** Previews prefetched ahead of the cursor (in the direction it last moved) and behind it */
const PREFETCH_AHEAD = 3;
const PREFETCH_BEHIND = 1;

/** Task tag of the guided tour's bulk-lesson material. */
const TOUR_BULK_TAG = { key: "tour", value: "bulk" };

const TASK_VIEW_KEY = "annotationTasks:view";

/**
 * How the table shows tasks; remembered in this browser.
 * - "list": pages of tasks, with a header row where a new night starts (the default)
 * - "nights": the nights, collapsed; a night's tasks load when it is expanded
 */
type TaskView = "list" | "nights";

function useTaskView(): [TaskView, (value: TaskView) => void] {
  const [value, setValue] = useState<TaskView>(() => {
    try {
      return window.localStorage.getItem(TASK_VIEW_KEY) === "nights" ? "nights" : "list";
    } catch {
      return "list";
    }
  });
  const set = useCallback((next: TaskView) => {
    setValue(next);
    try {
      window.localStorage.setItem(TASK_VIEW_KEY, next);
    } catch {
      // Not remembered, still applied
    }
  }, []);
  return [value, set];
}

/** Sort orders by recording time, under which tasks of a night are consecutive */
function sortsByRecordingTime(sortBy: string | undefined): boolean {
  return sortBy == null || sortBy === "recording_datetime";
}

export default function AnnotationTaskTable({
  filter,
  fixed,
  pathFormatter,
}: {
  filter: AnnotationTaskFilter;
  fixed?: (keyof AnnotationTaskFilter)[];
  pathFormatter?: (path: string) => string;
}) {
  const filterPersistKey = useMemo(
    () => annotationTaskFilterPersistKey(filter.annotation_project?.id),
    [filter.annotation_project?.id],
  );
  const TASK_INDEX_MAX = 2000;

  // Nights view: only the nights load at first, all collapsed, and a night's
  // tasks load when it is expanded. Not in guided tours, whose lessons work on
  // the plain list.
  const isGuidedTour = useContext(AnnotationProjectContext)?.is_guided_tour ?? false;
  const [taskView, setTaskView] = useTaskView();
  const nightMode = taskView === "nights" && !isGuidedTour;

  const annotationTasks = useAnnotationTasks({
    filter,
    fixed,
    persistKey: filterPersistKey,
    listView: true,
    enabled: !nightMode,
  });
  const nights = useAnnotationTaskNights({ filter: annotationTasks.filter.filter, enabled: nightMode });
  const { stats: nightModeStats } = useAnnotationTaskStats({
    filter: annotationTasks.filter.filter,
    enabled: nightMode,
  });
  // The table's rows: the page of tasks, or the tasks of the expanded nights
  const items = nightMode ? nights.items : annotationTasks.items;
  const total = nightMode ? nightModeStats?.total ?? 0 : annotationTasks.total;
  const pagination = nightMode ? nights.pagination : annotationTasks.pagination;
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [focusedElement, setFocusedElementState] = useState<'search' | 'filter' | number>(-1);
  // The cursor is mirrored in a ref so that key handlers always see the latest
  // value, even when key auto-repeat outpaces React re-rendering.
  const cursorRef = useRef<'search' | 'filter' | number>(-1);
  /** The task the cursor is on, so it stays on it when nights above expand or collapse */
  const cursorTaskIdRef = useRef<number | null>(null);
  // Night mode: the cursor can also rest on a night's header row (then no task is current)
  const [nightCursor, setNightCursorState] = useState<string | null>(null);
  const nightCursorRef = useRef<string | null>(null);
  const setNightCursor = useCallback((key: string | null) => {
    nightCursorRef.current = key;
    setNightCursorState(key);
  }, []);
  const setFocusedElement = useCallback((next: 'search' | 'filter' | number) => {
    cursorRef.current = next;
    setFocusedElementState(next);
    cursorTaskIdRef.current = typeof next === "number" && next >= 0 ? itemsRef.current[next]?.id ?? null : null;
    if (next !== -1) setNightCursor(null);
  }, [setNightCursor]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [targetMode, setTargetMode] = useState<"selected" | "filter_all">("selected");
  const [tagBulkPanelsOpen, setTagBulkPanelsOpen] = useState<Record<TagBulkPanel, boolean>>({
    addTaskTag: false,
    replace: false,
    addToTagged: false,
    deleteSoundEvents: false,
  });
  const anyTagBulkPanelOpen = Object.values(tagBulkPanelsOpen).some(Boolean);
  const anySoundEventTagPanelOpen = SOUND_EVENT_TAG_PANELS.some(
    (panel) => tagBulkPanelsOpen[panel],
  );
  const popoverButtonRef = useRef<HTMLButtonElement>(null);
  const [highlightRelated, setHighlightRelated] = useState(true);
  const [relatedWindow, setRelatedWindow] = useState(5);

  const activeFilter = annotationTasks.filter.filter;
  const projectId = activeFilter.annotation_project?.id;
  // birdedge's sound events are classifier windows: there are no calls to compare
  const hasCallBoxes = activeFilter.annotation_project?.has_call_boxes ?? true;
  const [referencesOpen, setReferencesOpen] = useState(false);
  const { pinned: pinnedSpecies, setPinned: setPinnedSpecies } = usePinnedReferenceSpecies(projectId);

  // Guided tour: bulk actions may only touch the bulk-lesson material, never a
  // lesson task (a badge there would skip the lesson). The server intersects
  // ticked ids with this filter, so it guards both selection modes.
  const bulkFilter = useMemo(
    () => (isGuidedTour ? { ...activeFilter, annotation_task_tag: TOUR_BULK_TAG } : activeFilter),
    [isGuidedTour, activeFilter],
  );

  const bulkActions = useAnnotationTaskBulkActions({
    filter: bulkFilter,
  });

  const selectedTaskIds = useMemo(() => {
    const ids = Object.entries(rowSelection)
      .filter(([, selected]) => selected)
      .map(([id]) => parseInt(id, 10));
    return ids;
  }, [rowSelection]);

  // Selection that follows the cursor: moving to a row (click, arrow keys)
  // ticks only that row; with Shift held, the rows from the anchor to it. The
  // anchor is where the last plain move (or checkbox/drag edit) happened;
  // `selectionBaseRef` holds what was ticked then, which a Shift range adds to.
  const selectionAnchorIdRef = useRef<number | null>(null);
  const selectionBaseRef = useRef<RowSelectionState>({});
  /** The selection the cursor ticked by itself (one row), while it is unchanged */
  const automaticSelectionRef = useRef<RowSelectionState | null>(null);
  const targetModeRef = useRef(targetMode);
  targetModeRef.current = targetMode;

  /** Checkbox, drag, header and Shift-tap edits: kept as they are, and a later Shift range adds to them */
  const handleRowSelectionChange: OnChangeFn<RowSelectionState> = useCallback((updater) => {
    setTargetMode("selected");
    setRowSelection((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      selectionBaseRef.current = next;
      automaticSelectionRef.current = null;
      return next;
    });
    const cursor = cursorRef.current;
    selectionAnchorIdRef.current =
      typeof cursor === "number" ? itemsRef.current[cursor]?.id ?? null : null;
  }, []);

  /**
   * Tick the row the cursor moved to: only that row, or with `extend` (Shift
   * held) the rows from the anchor to it in addition to what was ticked at the
   * anchor. With every task of the filter selected ("All N"), moving changes
   * nothing.
   */
  const selectCursorRow = useCallback((index: number, extend: boolean) => {
    if (targetModeRef.current === "filter_all") return;
    const items = itemsRef.current;
    const task = items[index];
    if (!task) return;
    const anchorIndex = extend
      ? items.findIndex((item) => item.id === selectionAnchorIdRef.current)
      : -1;
    let next: RowSelectionState;
    if (anchorIndex < 0) {
      next = { [String(task.id)]: true };
      selectionAnchorIdRef.current = task.id;
      selectionBaseRef.current = {};
      automaticSelectionRef.current = next;
    } else {
      next = { ...selectionBaseRef.current };
      const [from, to] = anchorIndex < index ? [anchorIndex, index] : [index, anchorIndex];
      for (const item of items.slice(from, to + 1)) next[String(item.id)] = true;
      automaticSelectionRef.current = null;
    }
    setTargetMode("selected");
    setRowSelection(next);
  }, []);

  const handleSelectAllMatchingFilter = useCallback(() => {
    setTargetMode("filter_all");
    setRowSelection({});
  }, []);

  const handleSelectPageOnly = useCallback(() => {
    setTargetMode("selected");
    setRowSelection(
      Object.fromEntries(items.map((task) => [String(task.id), true])),
    );
  }, [items]);

  const handleClearBulkSelection = useCallback(() => {
    setTargetMode("selected");
    setRowSelection({});
  }, []);

  const showBulkBar =
    targetMode === "filter_all" || selectedTaskIds.length > 0;

  const filterKey = useMemo(
    () => JSON.stringify(annotationTasks.filter.filter),
    [annotationTasks.filter.filter],
  );

  useEffect(() => {
    setRowSelection({});
    setTargetMode("selected");
    selectionAnchorIdRef.current = null;
    selectionBaseRef.current = {};
    automaticSelectionRef.current = null;
  }, [filterKey]);

  const bulkTagSummaryQuery = useQuery({
    queryKey: [
      "annotation_tasks_bulk_tag_summary",
      filterKey,
      targetMode,
      selectedTaskIds,
    ],
    queryFn: () =>
      api.annotationTasks.bulkSoundEventTagSummary({
        filter: bulkFilter,
        annotation_task_ids:
          targetMode === "selected" ? selectedTaskIds : undefined,
      }),
    enabled: showBulkBar && anySoundEventTagPanelOpen,
    refetchOnWindowFocus: false,
  });

  const handleTagBulkPanelOpenChange = useCallback(
    (panel: TagBulkPanel, open: boolean) => {
      setTagBulkPanelsOpen((prev) => ({ ...prev, [panel]: open }));
    },
    [],
  );

  const shouldLoadTaskIndex =
    // Night mode never loads every task: that is the point of it
    !nightMode
    && !annotationTasks.isLoading
    && annotationTasks.data != null
    && annotationTasks.total > 0
    && annotationTasks.total <= TASK_INDEX_MAX;

  const { data: indexPage } = useQuery({
    queryKey: ["annotation_tasks_index", annotationTasks.filter.filter],
    queryFn: () => api.annotationTasks.getIndex({
      limit: -1,
      offset: 0,
      ...annotationTasks.filter.filter,
    }),
    enabled: shouldLoadTaskIndex,
    refetchOnWindowFocus: false,
  });

  const allTasks = indexPage?.items;

  const getAnnotationTaskLink = useCallback((annotationProjectId: number, annotationTaskId: number): string => {
    const url = `detail/annotation/?annotation_task_id=${annotationTaskId}`;
    return `${url}&annotation_project_id=${annotationProjectId}`;
  }, []);

  const handleSortChange = useCallback((sortBy: string | undefined) => {
    annotationTasks.filter.set("sort_by", sortBy);
  }, [annotationTasks.filter]);

  // Set below, once the selection helpers exist; the table only needs a stable callback.
  const openTaskRef = useRef<(task: AnnotationTask) => void>(() => {});
  const onOpenTask = useCallback((task: AnnotationTask) => openTaskRef.current(task), []);

  const table = useAnnotationTaskTable({
    data: items,
    getAnnotationTaskLink: getAnnotationTaskLink,
    pathFormatter,
    // Row numbers count tasks per page; nights page by night, so none there
    pagination: nightMode ? undefined : annotationTasks.pagination,
    sortBy: annotationTasks.filter.get("sort_by") as string | undefined,
    onSortChange: handleSortChange,
    allTasks,
    rowSelection,
    onRowSelectionChange: handleRowSelectionChange,
    filterTotal: total,
    onSelectAllMatchingFilter: handleSelectAllMatchingFilter,
    onClearSelection: handleClearBulkSelection,
    targetMode,
    onOpenTask,
  });

  useKeyPressEvent(useKeyFilter({ key: SEARCH_BAR_LEAVE_SHORTCUT }), (event) => {
    if (focusedElement === -1 && nightCursorRef.current == null) {
      event.preventDefault();
      setFocusedElement('search');
      searchInputRef.current?.focus();
    }
  });

  const handleTableFocus = useCallback((index: number) => {
    if (index === -1) {
      setFocusedElement('search');
      searchInputRef.current?.focus();
    } else {
      setFocusedElement(index);
    }
  }, [setFocusedElement, searchInputRef]);

  const router = useRouter();

  /**
   * Make the ticked rows the task filter of the project, which the annotate
   * view shares, and return the task to open first. With "all matching the
   * filter" ticked, the current filter already describes the selection.
   */
  const applySelectionFilter = useCallback(
    (preferredTaskId?: number): number | null => {
      if (targetMode === "filter_all") {
        return preferredTaskId ?? items[0]?.id ?? null;
      }
      if (selectedTaskIds.length === 0) return null;
      const projectId = activeFilter.annotation_project?.id;
      // Write it now: the filter hook persists with a debounce, and the
      // annotate view (new tab or next page) reads it right away.
      writeAnnotationTaskFilterPersist(projectId, {
        ...activeFilter,
        annotation_task_ids: selectedTaskIds,
      });
      annotationTasks.filter.set("annotation_task_ids", selectedTaskIds);
      if (preferredTaskId != null && selectedTaskIds.includes(preferredTaskId)) return preferredTaskId;
      const selected = new Set(selectedTaskIds);
      const order = allTasks ?? items;
      return order.find((t) => selected.has(t.id))?.id ?? selectedTaskIds[0];
    },
    [targetMode, selectedTaskIds, activeFilter, annotationTasks.filter, items, allTasks],
  );

  // The cursor's own tick does not count: opening the current task then
  // annotates the whole filter as before, not just that one task.
  const isTicked = useCallback(
    (task: AnnotationTask) =>
      targetMode === "selected"
      && rowSelection !== automaticSelectionRef.current
      && Boolean(rowSelection[String(task.id)]),
    [targetMode, rowSelection],
  );

  // Opening a ticked task annotates the ticked tasks: they become the filter.
  const handleOpenTask = useCallback(
    (task: AnnotationTask) => {
      if (isTicked(task)) applySelectionFilter(task.id);
    },
    [isTicked, applySelectionFilter],
  );
  openTaskRef.current = handleOpenTask;

  // 8: annotate the ticked tasks in this tab (7 opens Annotate as usual).
  useKeyPressEvent(useKeyFilter({ key: ANNOTATE_SELECTION_SHORTCUT }), (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (document.querySelector('[role="dialog"]')) return;
    const projectId = activeFilter.annotation_project?.id;
    const taskId = applySelectionFilter();
    if (taskId == null || projectId == null) {
      toast("Tick the tasks you want to annotate first.", { id: "annotate-selection" });
      return;
    }
    router.push(`/annotation_projects/${getAnnotationTaskLink(projectId, taskId)}`);
  });

  const handleSelect = useCallback((task: AnnotationTask) => {
    handleOpenTask(task);
    const link = getAnnotationTaskLink(task.annotation_project_id, task.id);
    if (link) {
      // Open the annotate view in a new tab so the table (filters, selection,
      // scroll position) stays as it is.
      const basePath = process.env.NEXT_PUBLIC_SONARI_FOLDER ?? "";
      window.open(`${basePath}/annotation_projects/${link}`, "_blank", "noopener");
    }
  }, [getAnnotationTaskLink, handleOpenTask]);

  const btn = <Button
    mode="outline"
    variant="secondary"
    padding="px-3 py-2"
    autoFocus={false}
    ref={popoverButtonRef}
  >
    <FilterIcon className="h-5 w-5 stroke-2" />
  </Button>

  useKeyPressEvent(FILTER_POPOVER_SHORTCUT, (event: KeyboardEvent) => {
    const button = popoverButtonRef.current;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }
    if (button instanceof HTMLButtonElement && focusedElement !== 'search' && focusedElement !== 'filter') {
      button.click();
    }
  });

  const currentPageTaskIds = useMemo(
    () => items.map((task) => task.id),
    [items],
  );

  const relatedTaskIds = useMemo(
    () => highlightRelated
      ? findTemporallyRelatedTasks(items, relatedWindow)
      : new Set<number>(),
    [highlightRelated, items, relatedWindow],
  );

  const getRowClassName = useCallback(
    (task: AnnotationTask) =>
      relatedTaskIds.has(task.id) ? "bg-emerald-100 dark:bg-emerald-900/30" : undefined,
    [relatedTaskIds],
  );

  // Entering the table via the header tab leaves that tab focused, which blocks
  // the keyboard shortcuts (they ignore events from buttons). Release it.
  useEffect(() => {
    const active = document.activeElement;
    if (
      active instanceof HTMLElement
      && (active instanceof HTMLButtonElement || active instanceof HTMLAnchorElement)
    ) {
      active.blur();
    }
  }, []);

  // Escape drops the checkbox selection (unless a panel/dialog or text field owns the key)
  useEffect(() => {
    if (!showBulkBar || anyTagBulkPanelOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement && !["checkbox", "radio", "button"].includes(target.type)
      ) return;
      if (target instanceof HTMLTextAreaElement) return;
      if (document.querySelector('[role="dialog"]')) return;
      handleClearBulkSelection();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showBulkBar, anyTagBulkPanelOpen, handleClearBulkSelection]);

  const bulkBarRef = useRef<HTMLDivElement>(null);
  const pendingScrollIdRef = useRef<number | null>(null);

  // Preview model: the current row ("cursor") has the one active preview, which
  // follows it; pinned previews stay open on their rows. Everything the key
  // handler needs is mirrored in refs (see cursorRef).
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const [activeOpen, setActiveOpenState] = useState(false);
  const activeOpenRef = useRef(false);
  const setActiveOpen = useCallback((open: boolean) => {
    activeOpenRef.current = open;
    setActiveOpenState(open);
  }, []);
  const [pinnedIds, setPinnedIds] = useState<number[]>([]);
  const pinnedRef = useRef<number[]>([]);
  const updatePinned = useCallback((update: (prev: number[]) => number[]) => {
    pinnedRef.current = update(pinnedRef.current);
    setPinnedIds(pinnedRef.current);
  }, []);
  const togglePin = useCallback(
    (taskId: number) =>
      updatePinned((prev) =>
        prev.includes(taskId)
          ? prev.filter((id) => id !== taskId)
          : [...prev, taskId].slice(-MAX_PINNED_PREVIEWS),
      ),
    [updatePinned],
  );

  // Channel shown in all previews (null: the saved spectrogram channel). Kept
  // apart from the spectrogram settings, so switching it here changes nothing else.
  const [previewChannel, setPreviewChannelState] = useState<PreviewChannel | null>(null);
  const previewChannelRef = useRef<PreviewChannel | null>(null);
  const setPreviewChannel = useCallback((channel: PreviewChannel) => {
    previewChannelRef.current = channel;
    setPreviewChannelState(channel);
  }, []);
  const savedSettings = useStore((state) => state.spectrogramSettings);
  const savedChannelRef = useRef<PreviewChannel>(0);
  savedChannelRef.current = savedSettings.mix_channels ? "mix" : savedSettings.channel;

  const activeTaskId =
    activeOpen && typeof focusedElement === "number" && focusedElement >= 0
      ? items[focusedElement]?.id ?? null
      : null;

  // Don't request spectrograms for rows the cursor only passes through: while it
  // moves fast (a held arrow key), a row only counts once the cursor rested on it.
  // A click or a single key press loads at once. Settled is tied to the row, so it
  // is false in the very render the cursor moves.
  const [settledTaskId, setSettledTaskId] = useState<number | null>(null);
  const lastMoveRef = useRef(-Infinity);
  useEffect(() => {
    // Only moves onto a row count (not mounting or closing the preview)
    if (activeTaskId == null) return;
    const now = performance.now();
    const moving = now - lastMoveRef.current < PREVIEW_SETTLE_MS;
    lastMoveRef.current = now;
    if (!moving) {
      setSettledTaskId(activeTaskId);
      return;
    }
    const timer = setTimeout(() => setSettledTaskId(activeTaskId), PREVIEW_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [activeTaskId]);
  const activeSettled = activeTaskId != null && settledTaskId === activeTaskId;

  // Once the cursor rests on a row, prefetch the previews of the next rows (in the
  // direction it last moved) and of the row behind it, so they show at once when
  // the cursor gets there. Moving on drops the prefetches still waiting.
  const directionRef = useRef<1 | -1>(1);
  useEffect(() => {
    if (activeTaskId == null || !activeSettled || typeof focusedElement !== "number") return;
    const direction = directionRef.current;
    const offsets = [
      ...Array.from({ length: PREFETCH_AHEAD }, (_, i) => direction * (i + 1)),
      ...Array.from({ length: PREFETCH_BEHIND }, (_, i) => -direction * (i + 1)),
    ];
    const requests = offsets
      .map((offset) => items[focusedElement + offset])
      .filter((task): task is AnnotationTask => task != null)
      .map((task) => ({ task, ...getPreviewImageRequest(task, savedSettings, previewChannel) }))
      .filter(({ previewable }) => previewable)
      .map(({ task, segment, imageParameters }): ImageRequest => ({
        kind: "spectrogram",
        recording_id: task.recording_id,
        segment,
        parameters: imageParameters,
      }));
    const controller = new AbortController();
    prefetchImages(requests, controller.signal);
    return () => controller.abort();
  }, [activeTaskId, activeSettled, focusedElement, items, savedSettings, previewChannel]);

  // After the cursor moved and the previews re-rendered (previous one collapsed,
  // new one expanded), scroll the current row into view.
  useEffect(() => {
    const taskId = pendingScrollIdRef.current;
    if (taskId == null) return;
    pendingScrollIdRef.current = null;
    const barHeight = bulkBarRef.current?.offsetHeight ?? 0;
    scrollRowIntoView(taskId, barHeight + 8);
  }, [focusedElement, activeOpen, pinnedIds]);

  const moveCursorTo = useCallback(
    (index: number, { extendSelection = false }: { extendSelection?: boolean } = {}) => {
      const task = itemsRef.current[index];
      if (!task) return;
      setFocusedElement(index);
      setActiveOpen(true);
      selectCursorRow(index, extendSelection);
      pendingScrollIdRef.current = task.id;
    },
    [setFocusedElement, setActiveOpen, selectCursorRow],
  );

  // Where the cursor can go, top to bottom: tasks, and in night mode each
  // night's header followed by its tasks if expanded. Read from refs, so the
  // key handler always sees the latest rows.
  const nightModeRef = useRef(nightMode);
  nightModeRef.current = nightMode;
  const groupsRef = useRef<NightGroup[]>(nights.groups);
  groupsRef.current = nights.groups;
  const nightOfTaskRef = useRef(new Map<number, string>());
  for (const group of nights.groups) {
    for (const task of group.tasks) nightOfTaskRef.current.set(task.id, group.key);
  }

  type CursorSlot = { night: string } | { index: number };
  const cursorSlots = useCallback((): CursorSlot[] => {
    if (!nightModeRef.current) return itemsRef.current.map((_, index) => ({ index }));
    const slots: CursorSlot[] = [];
    for (const group of groupsRef.current) {
      slots.push({ night: group.key });
      if (group.expanded) {
        group.tasks.forEach((_, offset) => slots.push({ index: group.start + offset }));
      }
    }
    return slots;
  }, []);

  const pendingScrollNightRef = useRef<string | null>(null);
  const moveCursorToNight = useCallback(
    (key: string) => {
      setFocusedElement(-1);
      setNightCursor(key);
      pendingScrollNightRef.current = key;
    },
    [setFocusedElement, setNightCursor],
  );

  const moveToSlot = useCallback(
    (slot: CursorSlot, extendSelection = false) => {
      if ("index" in slot) moveCursorTo(slot.index, { extendSelection });
      else moveCursorToNight(slot.night);
    },
    [moveCursorTo, moveCursorToNight],
  );

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === LIST_OVERVIEW_DOWN_SHORTCUT) {
      e.preventDefault();
      const first = cursorSlots()[0];
      if (first) {
        moveToSlot(first);
        searchInputRef.current?.blur();
      }
    }
  }, [cursorSlots, moveToSlot]);

  // Keep the cursor on its task when the rows change (a night above expanded
  // or collapsed); if its night collapsed, it moves to that night's header.
  useLayoutEffect(() => {
    const id = cursorTaskIdRef.current;
    if (id == null) return;
    const index = items.findIndex((task) => task.id === id);
    if (index >= 0) {
      if (index !== cursorRef.current) setFocusedElement(index);
    } else if (nightMode) {
      const key = nightOfTaskRef.current.get(id);
      setFocusedElement(-1);
      if (key != null && nights.groups.some((group) => group.key === key)) setNightCursor(key);
    }
  }, [items, nightMode, nights.groups, setFocusedElement, setNightCursor]);

  useEffect(() => {
    const key = pendingScrollNightRef.current;
    if (key == null || key !== nightCursor) return;
    pendingScrollNightRef.current = null;
    scrollNightIntoView(key, (bulkBarRef.current?.offsetHeight ?? 0) + 8);
  }, [nightCursor]);

  /** Tick state of a night: from its tasks if all are loaded, or the ids fetched when it was ticked */
  const [nightTaskIds, setNightTaskIds] = useState<ReadonlyMap<string, number[]>>(() => new Map());
  useEffect(() => setNightTaskIds(new Map()), [filterKey]);
  const idsOfNight = useCallback(
    (group: NightGroup): number[] | undefined =>
      group.expanded && !group.isLoadingTasks && !group.hasMore
        ? group.tasks.map((task) => task.id)
        : nightTaskIds.get(group.key),
    [nightTaskIds],
  );
  const nightTickState = useCallback(
    (group: NightGroup): NightTickState => {
      if (targetMode === "filter_all") return "all";
      const ids = idsOfNight(group);
      if (!ids || ids.length === 0) return "none";
      const ticked = ids.filter((id) => rowSelection[String(id)]).length;
      return ticked === 0 ? "none" : ticked === ids.length ? "all" : "some";
    },
    [targetMode, idsOfNight, rowSelection],
  );
  /** Tick every task of a night (loading its ids if it is collapsed), or untick them all */
  const toggleNightTick = useCallback(
    async (group: NightGroup) => {
      if (group.empty) return;
      const untick = nightTickState(group) === "all";
      let ids = idsOfNight(group);
      if (ids == null) {
        ids = await nights.fetchNightTaskIds(group.key);
        const loaded = ids;
        setNightTaskIds((prev) => new Map(prev).set(group.key, loaded));
      }
      const nightIds = ids;
      handleRowSelectionChange((prev) => {
        const next = { ...prev };
        for (const id of nightIds) {
          if (untick) delete next[String(id)];
          else next[String(id)] = true;
        }
        return next;
      });
    },
    [nightTickState, idsOfNight, nights.fetchNightTaskIds, handleRowSelectionChange],
  );
  const toggleNightTickRef = useRef(toggleNightTick);
  toggleNightTickRef.current = toggleNightTick;

  const toggleNightExpanded = useCallback(
    (group: NightGroup) => {
      nights.setExpanded(group.key, !group.expanded);
      moveCursorToNight(group.key);
    },
    [nights.setExpanded, moveCursorToNight],
  );

  // The cursor on the last loaded task of a night loads the night's next tasks
  const loadMoreNight = nights.loadMore;
  useEffect(() => {
    if (!nightMode || typeof focusedElement !== "number" || focusedElement < 0) return;
    const group = nights.groups.find(
      (g) => g.expanded && focusedElement >= g.start && focusedElement < g.start + g.tasks.length,
    );
    if (group?.hasMore && focusedElement === group.start + group.tasks.length - 1) loadMoreNight(group.key);
  }, [nightMode, focusedElement, nights.groups, loadMoreNight]);
  const setNightExpandedRef = useRef(nights.setExpanded);
  setNightExpandedRef.current = nights.setExpanded;

  const handleRowClick = useCallback(
    (task: AnnotationTask, { index, event }: { index: number; event: React.MouseEvent }) => {
      if (event.shiftKey) {
        // Shift + click ticks the rows from the anchor to this one
        setFocusedElement(index);
        setActiveOpen(true);
        selectCursorRow(index, true);
        emitGuidedTourEvent("task-preview-opened");
        return;
      }
      if (cursorRef.current === index) {
        // Clicking the current row closes its preview (pinned or not)
        updatePinned((prev) => prev.filter((id) => id !== task.id));
        const open = !activeOpenRef.current || pinnedRef.current.includes(task.id);
        setActiveOpen(open);
        if (open) emitGuidedTourEvent("task-preview-opened");
      } else {
        setFocusedElement(index);
        setActiveOpen(true);
        selectCursorRow(index, false);
        emitGuidedTourEvent("task-preview-opened");
      }
    },
    [setFocusedElement, setActiveOpen, updatePinned, selectCursorRow],
  );

  // One keyboard handler for moving the cursor, pinning and ticking the
  // current row. It only reads refs, so it is registered once and never stale.
  //   ArrowUp / ArrowDown  move the cursor (its preview follows, the page scrolls)
  //   p                    pin / unpin the current row's preview
  //   c                    cycle the channel shown in the previews
  //   Shift + ↑ / ↓        move and tick the rows from the anchor to the new one
  //   Shift (tap)          tick / untick the checkbox of the current row
  // A Shift tap counts on release, and only if no other key or click came
  // while it was held: Shift + click and Shift + arrow must not toggle.
  const shiftTapRef = useRef(false);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Shift") {
        if (!event.repeat) shiftTapRef.current = true;
      } else {
        shiftTapRef.current = false;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const cursor = cursorRef.current;
      const onNight = nightCursorRef.current;
      if (onNight == null && (typeof cursor !== "number" || cursor < 0)) return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement
        && !["checkbox", "radio", "button"].includes(target.type)
      ) return;
      if (target instanceof HTMLTextAreaElement) return;
      if (document.querySelector('[role="dialog"]')) return;

      const items = itemsRef.current;

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const slots = cursorSlots();
        const at = onNight != null
          ? slots.findIndex((slot) => "night" in slot && slot.night === onNight)
          : slots.findIndex((slot) => "index" in slot && slot.index === cursor);
        if (at < 0) return;
        const next = event.key === "ArrowDown" ? Math.min(slots.length - 1, at + 1) : at - 1;
        if (next < 0) {
          setFocusedElement("search");
          searchInputRef.current?.focus();
        } else if (next !== at) {
          directionRef.current = next > at ? 1 : -1;
          moveToSlot(slots[next], event.shiftKey);
        }
        return;
      }

      // Night headers: → or Enter expands, ← collapses
      if (onNight != null) {
        if (event.key === "ArrowRight" || event.key === "Enter") {
          event.preventDefault();
          setNightExpandedRef.current(onNight, true);
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          setNightExpandedRef.current(onNight, false);
        }
        return;
      }
      if (typeof cursor !== "number") return;

      const current = items[cursor];
      if (!current) return;

      // ← on a task collapses its night; the cursor moves to the night's header
      if (event.key === "ArrowLeft" && nightModeRef.current) {
        const key = nightOfTaskRef.current.get(current.id);
        if (key != null) {
          event.preventDefault();
          setNightExpandedRef.current(key, false);
          moveCursorToNight(key);
        }
        return;
      }

      if (event.key === PIN_PREVIEW_SHORTCUT && !event.shiftKey) {
        togglePin(current.id);
        return;
      }

      if (event.key === PREVIEW_CHANNEL_SHORTCUT && !event.shiftKey) {
        const previewOpen = activeOpenRef.current || pinnedRef.current.includes(current.id);
        const channels = current.recording?.channels ?? 1;
        if (!previewOpen || channels < 2) return;
        // Continue from the channel the current row's preview shows
        const shown = previewChannelRef.current ?? savedChannelRef.current;
        setPreviewChannel(nextPreviewChannel(shown, channels));
        return;
      }

    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== "Shift" || !shiftTapRef.current) return;
      shiftTapRef.current = false;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const cursor = cursorRef.current;
      const onNight = nightCursorRef.current;
      if (onNight == null && (typeof cursor !== "number" || cursor < 0)) return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement
        && !["checkbox", "radio", "button"].includes(target.type)
      ) return;
      if (target instanceof HTMLTextAreaElement) return;
      if (document.querySelector('[role="dialog"]')) return;
      // On a night header, a Shift tap ticks (or unticks) the whole night
      if (onNight != null) {
        const group = groupsRef.current.find((g) => g.key === onNight);
        if (group) void toggleNightTickRef.current(group);
        return;
      }
      if (typeof cursor !== "number") return;
      const current = itemsRef.current[cursor];
      if (!current) return;
      const previewOpen = activeOpenRef.current || pinnedRef.current.includes(current.id);
      if (!previewOpen) return;
      handleRowSelectionChange((prev) => {
        const next = { ...prev };
        const id = String(current.id);
        if (next[id]) delete next[id];
        else next[id] = true;
        return next;
      });
    };
    const onPointerDown = () => {
      shiftTapRef.current = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("mousedown", onPointerDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mousedown", onPointerDown, true);
    };
  }, [moveCursorTo, setFocusedElement, togglePin, handleRowSelectionChange, setPreviewChannel, cursorSlots, moveToSlot, moveCursorToNight]);

  // Night rows around the tasks: before the first task of each expanded night
  // come the "show more" row of the previous expanded night (if not all its
  // tasks are loaded) and the headers of the nights since; the rest after the
  // last task.
  type NightRow = { kind: "header" | "more"; group: NightGroup };
  const { nightRowsBeforeRow, trailingNightRows } = useMemo(() => {
    const nightRowsBeforeRow = new Map<number, NightRow[]>();
    let pending: NightRow[] = [];
    let previous: NightGroup | null = null;
    for (const group of nights.groups) {
      pending.push({ kind: "header", group });
      if (group.expanded && group.tasks.length > 0) {
        if (previous?.hasMore) pending.unshift({ kind: "more", group: previous });
        nightRowsBeforeRow.set(group.start, pending);
        pending = [];
        previous = group;
      }
    }
    if (previous?.hasMore) {
      // Right after the previous night's tasks, before the headers that follow
      pending.unshift({ kind: "more", group: previous });
    }
    return { nightRowsBeforeRow, trailingNightRows: pending };
  }, [nights.groups]);

  const renderNightHeaders = useCallback(
    (rows: NightRow[] | undefined, colSpan: number) =>
      rows?.map(({ kind, group }) =>
        kind === "more" ? (
          <NightMoreRow
            key={`night-more-${group.key}`}
            group={group}
            colSpan={colSpan}
            onLoadMore={() => loadMoreNight(group.key)}
          />
        ) : (
          <NightHeaderRow
            key={`night-${group.key}`}
            group={group}
            colSpan={colSpan}
            current={nightCursor === group.key}
            narrowed={nights.narrowed}
            tickState={nightTickState(group)}
            onToggleExpanded={() => toggleNightExpanded(group)}
            onToggleTick={() => void toggleNightTick(group)}
          />
        ),
      ),
    [nightCursor, nights.narrowed, nightTickState, toggleNightExpanded, toggleNightTick, loadMoreNight],
  );
  const renderBeforeRow = useCallback(
    (_task: AnnotationTask, index: number, colSpan: number) => renderNightHeaders(nightRowsBeforeRow.get(index), colSpan),
    [renderNightHeaders, nightRowsBeforeRow],
  );
  const renderTrailingRows = useCallback(
    (colSpan: number) => renderNightHeaders(trailingNightRows, colSpan),
    [renderNightHeaders, trailingNightRows],
  );

  // List view: a divider where a new night starts on the page, computed from
  // the page's tasks alone. Only while sorted by recording time; under other
  // orders a night's tasks are scattered and it would head many runs.
  const [listUtcOffset] = useState(currentUtcOffset);
  const showListNights =
    !nightMode && sortsByRecordingTime(annotationTasks.filter.get("sort_by") as string | undefined);
  const listNightStarts = useMemo(() => {
    const starts = new Map<number, { night: string | null; count: number }>();
    if (!showListNights) return starts;
    let current: { night: string | null; count: number } | null = null;
    annotationTasks.items.forEach((task, index) => {
      const night = nightOfRecording(task.recording, listUtcOffset);
      if (current == null || nightKey(current.night) !== nightKey(night)) {
        current = { night, count: 0 };
        starts.set(index, current);
      }
      current.count += 1;
    });
    return starts;
  }, [showListNights, annotationTasks.items, listUtcOffset]);
  const renderListNightDivider = useCallback(
    (_task: AnnotationTask, index: number, colSpan: number) => {
      const start = listNightStarts.get(index);
      return start ? <NightDividerRow night={start.night} count={start.count} colSpan={colSpan} /> : null;
    },
    [listNightStarts],
  );

  const renderExpandedRow = useCallback(
    (task: AnnotationTask) => {
      const pinned = pinnedIds.includes(task.id);
      if (!pinned && task.id !== activeTaskId) return null;
      return (
        <AnnotationTaskSpectrogramPreview
          task={task}
          pinned={pinned}
          deferred={!pinned && !activeSettled}
          onTogglePin={() => togglePin(task.id)}
          channel={previewChannel}
          onChannelChange={setPreviewChannel}
        />
      );
    },
    [pinnedIds, activeTaskId, activeSettled, togglePin, previewChannel, setPreviewChannel],
  );

  if (nightMode ? nights.isLoading || nights.data == null : annotationTasks.isLoading || annotationTasks.data == null) {
    return <Loading />;
  }

  // The previous rows stay visible while a new filter (or page) loads, and a
  // filter edit first waits for the debounce: say that results are coming.
  const isFiltering =
    (annotationTasks.filter.isPending ?? false)
    || (nightMode
      ? nights.isFetching && nights.isPlaceholderData
      : annotationTasks.isFetching && annotationTasks.isPlaceholderData);
  // Another page loads: its rows are left out until they arrive (not the previous page's)
  const isPageLoading = nightMode ? nights.isPageLoading : annotationTasks.isPageLoading;

  return (
    <div className="flex flex-col gap-y-4" data-guided-tour="task-table">
      <div className="flex flex-row justify-between space-x-4">
        <div className="flex flex-row space-x-3 basis-1/2">
          <div className="grow">
            <Search
              label="Search"
              placeholder="Search recordings..."
              value={annotationTasks.filter.get("search_recordings") ?? ""}
              onChange={(value) =>
                annotationTasks.filter.set("search_recordings", value as string)
              }
              onKeyDown={handleSearchKeyDown}
              inputRef={searchInputRef as React.RefObject<HTMLInputElement>}
              isHighlighted={focusedElement === 'search'}
            />
          </div>
          <div data-guided-tour="tasks-filter">
            <FilterPopover
              filter={annotationTasks.filter}
              filterDef={tasksFilterDefs}
              button={btn}
            />
          </div>
          <FilterPresets
            storageKey="presets:annotation_tasks"
            filter={annotationTasks.filter}
            normalizeForPreset={normalizeDateRangeForPreset}
          />
          {projectId != null && hasCallBoxes && (
            <Button
              mode={referencesOpen || pinnedSpecies ? "filled" : "outline"}
              variant="secondary"
              padding="px-3 py-2"
              onClick={() => setReferencesOpen((open) => !open)}
              title="The clearest, loudest calls of a species, side by side"
            >
              <VolumeIcon className="inline-block h-5 w-5 align-middle" /> Reference calls
            </Button>
          )}
          <div data-guided-tour="task-shortcuts">
            <ShortcutHelper shortcuts={TASK_TABLE_SHORTCUTS} />
          </div>
        </div>
        <div className="flex flex-row items-center gap-4">
        {!isGuidedTour && (
          <div
            role="radiogroup"
            aria-label="Task view"
            className="flex flex-row overflow-hidden rounded-md border border-stone-300 text-sm dark:border-stone-600"
          >
            {([
              ["list", "List", "Pages of tasks, with a header where a new night (noon to noon) starts"],
              ["nights", "Nights", "The nights (noon to noon), collapsed; a night's tasks load when you expand it"],
            ] as const).map(([value, label, title]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={taskView === value}
                title={title}
                // Don't keep the focus: a focused button blocks the table's shortcuts
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setTaskView(value)}
                className={classNames(
                  "px-2 py-0.5",
                  taskView === value
                    ? "bg-emerald-600 text-white dark:bg-emerald-700"
                    : "text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <label
          className="flex flex-row items-center gap-2 text-sm text-stone-600 dark:text-stone-400"
          title="Highlight tasks that share a sound event tag and are within the time window of another task (gap between end of one and start of next)"
        >
          <input
            type="checkbox"
            checked={highlightRelated}
            onChange={(e) => setHighlightRelated(e.target.checked)}
          />
          Highlight related within
          <input
            type="number"
            min={0}
            step={0.5}
            value={relatedWindow}
            disabled={!highlightRelated}
            onChange={(e) => {
              const value = parseFloat(e.target.value);
              setRelatedWindow(Number.isFinite(value) ? Math.max(0, value) : 0);
            }}
            className="w-16 rounded-md border border-stone-300 bg-transparent px-2 py-1 dark:border-stone-600"
          />
          s
        </label>
        </div>
      </div>
      {projectId != null && hasCallBoxes && (referencesOpen || pinnedSpecies != null) && (
        <ReferenceCallsPanel
          annotationProjectId={projectId}
          initialSpecies={includedSpecies(annotationTasks.filter) ?? null}
          pinned={pinnedSpecies}
          onPinnedChange={setPinnedSpecies}
          onClose={() => {
            setReferencesOpen(false);
            setPinnedSpecies(null);
          }}
        />
      )}
      <FilterBar
        filter={annotationTasks.filter}
        total={total}
        filterDef={tasksFilterDefs}
      />
      <div className="-my-3 flex h-2 flex-row items-center gap-3" aria-live="polite">
        {isFiltering && (
          <>
            <div
              className="h-1 grow overflow-hidden rounded-full bg-emerald-200/80 dark:bg-emerald-900/50"
              role="progressbar"
              aria-valuetext="Loading filtered tasks"
            >
              <div className="bulk-action-progress-indeterminate h-full w-1/3 rounded-full bg-emerald-600 motion-reduce:animate-none dark:bg-emerald-400" />
            </div>
            <span className="shrink-0 text-xs text-stone-500 dark:text-stone-400">
              {isPageLoading ? "Loading page…" : "Filtering…"}
            </span>
          </>
        )}
      </div>
      {showBulkBar && (
        <div ref={bulkBarRef} className="sticky top-0 z-30 rounded-md bg-stone-100 shadow-md dark:bg-stone-900" data-guided-tour="tasks-bulk-bar">
        <AnnotationTaskBulkActionBar
          targetMode={targetMode}
          selectedTaskIds={selectedTaskIds}
          filterTotal={total}
          currentPageTaskIds={currentPageTaskIds}
          soundEventTagCounts={bulkTagSummaryQuery.data ?? []}
          isTagSummaryLoading={bulkTagSummaryQuery.isLoading}
          bulkAddBadge={bulkActions.bulkAddBadge}
          bulkRemoveBadge={bulkActions.bulkRemoveBadge}
          bulkAddTag={bulkActions.bulkAddTag}
          bulkReplaceSoundEventTags={bulkActions.bulkReplaceSoundEventTags}
          bulkDeleteSoundEventsByTag={bulkActions.bulkDeleteSoundEventsByTag}
          progress={bulkActions.progress}
          onStop={bulkActions.stop}
          onClearSelection={handleClearBulkSelection}
          onSelectAllMatchingFilter={handleSelectAllMatchingFilter}
          onSelectPageOnly={handleSelectPageOnly}
          onTagBulkPanelOpenChange={handleTagBulkPanelOpenChange}
        />
        </div>
      )}
      <div className="w-full" aria-busy={isFiltering}>
        <div
          className={`w-full min-w-0 overflow-x-auto rounded-md outline outline-1 outline-stone-200 transition-opacity duration-200 dark:outline-stone-800 ${
            isFiltering ? "opacity-50" : ""
          }`}
        >
          <Table
            table={table}
            selectedIndex={typeof focusedElement === 'number' ? focusedElement : -1}
            onFocusChange={handleTableFocus}
            onSelect={handleSelect}
            getRowClassName={getRowClassName}
            dragSelect
            arrowKeys={false}
            onRowClick={handleRowClick}
            renderExpandedRow={renderExpandedRow}
            renderBeforeRow={nightMode ? renderBeforeRow : showListNights ? renderListNightDivider : undefined}
            renderTrailingRows={nightMode ? renderTrailingRows : undefined}
            handleNumberKeys={
              focusedElement !== 'search'
              && focusedElement !== 'filter'
              && selectedTaskIds.length === 0
              && targetMode !== 'filter_all'
            }
          />
        </div>
      </div>
      <Pagination {...pagination} />
    </div>
  );
}