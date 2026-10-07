import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RowSelectionState, OnChangeFn } from "@tanstack/react-table";
import { useKeyPressEvent } from "react-use";
import { useQuery } from "@tanstack/react-query";
import api from "@/app/api";
import useKeyFilter from "@/hooks/utils/useKeyFilter";
import type { AnnotationTaskFilter } from "@/api/annotation_tasks";
import type { AnnotationTask } from "@/types";
import useAnnotationTasks from "@/hooks/api/useAnnotationTasks";
import { annotationTaskFilterPersistKey } from "@/hooks/utils/annotationTaskFilterPersistKey";
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
import { PIN_PREVIEW_SHORTCUT, TASK_TABLE_SHORTCUTS, LIST_OVERVIEW_DOWN_SHORTCUT, SEARCH_BAR_LEAVE_SHORTCUT, FILTER_POPOVER_SHORTCUT } from "@/utils/keyboard";
import AnnotationTaskSpectrogramPreview from "@/components/annotation_tasks/AnnotationTaskSpectrogramPreview";
import { findTemporallyRelatedTasks } from "@/utils/temporalClusters";
import Button from "../Button";
import { FilterIcon } from "../icons";

/**
 * Scrolls the one real scroll container so a table row (and its expanded
 * preview, if any) is visible, keeping clear of the sticky bulk action bar.
 */
function scrollRowIntoView(taskId: number, topInset: number) {
  const row = document.querySelector<HTMLElement>(`[data-row-id="${taskId}"]`);
  if (!row) return;
  const preview = document.querySelector<HTMLElement>(`[data-expanded-row-for="${taskId}"]`);

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

  const annotationTasks = useAnnotationTasks({
    filter,
    fixed,
    persistKey: filterPersistKey,
    listView: true,
  });
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [focusedElement, setFocusedElementState] = useState<'search' | 'filter' | number>(-1);
  // The cursor is mirrored in a ref so that key handlers always see the latest
  // value, even when key auto-repeat outpaces React re-rendering.
  const cursorRef = useRef<'search' | 'filter' | number>(-1);
  const setFocusedElement = useCallback((next: 'search' | 'filter' | number) => {
    cursorRef.current = next;
    setFocusedElementState(next);
  }, []);
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

  const bulkActions = useAnnotationTaskBulkActions({
    filter: activeFilter,
  });

  const selectedTaskIds = useMemo(() => {
    const ids = Object.entries(rowSelection)
      .filter(([, selected]) => selected)
      .map(([id]) => parseInt(id, 10));
    return ids;
  }, [rowSelection]);

  const handleRowSelectionChange: OnChangeFn<RowSelectionState> = useCallback((updater) => {
    setTargetMode("selected");
    setRowSelection((prev) =>
      typeof updater === "function" ? updater(prev) : updater,
    );
  }, []);

  const handleSelectAllMatchingFilter = useCallback(() => {
    setTargetMode("filter_all");
    setRowSelection({});
  }, []);

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
        filter: activeFilter,
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
    !annotationTasks.isLoading
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

  const table = useAnnotationTaskTable({
    data: annotationTasks.items,
    getAnnotationTaskLink: getAnnotationTaskLink,
    pathFormatter,
    pagination: annotationTasks.pagination,
    sortBy: annotationTasks.filter.get("sort_by") as string | undefined,
    onSortChange: handleSortChange,
    allTasks,
    rowSelection,
    onRowSelectionChange: handleRowSelectionChange,
    filterTotal: annotationTasks.total,
    onSelectAllMatchingFilter: handleSelectAllMatchingFilter,
    targetMode,
  });

  useKeyPressEvent(useKeyFilter({ key: SEARCH_BAR_LEAVE_SHORTCUT }), (event) => {
    if (focusedElement === -1) {
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

  const handleSelect = useCallback((task: AnnotationTask) => {
    const link = getAnnotationTaskLink(task.annotation_project_id, task.id);
    if (link) {
      // Open the annotate view in a new tab so the table (filters, selection,
      // scroll position) stays as it is.
      const basePath = process.env.NEXT_PUBLIC_SONARI_FOLDER ?? "";
      window.open(`${basePath}/annotation_projects/${link}`, "_blank", "noopener");
    }
  }, [getAnnotationTaskLink]);

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
    () => annotationTasks.items.map((task) => task.id),
    [annotationTasks.items],
  );

  const relatedTaskIds = useMemo(
    () => highlightRelated
      ? findTemporallyRelatedTasks(annotationTasks.items, relatedWindow)
      : new Set<number>(),
    [highlightRelated, annotationTasks.items, relatedWindow],
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
  const itemsRef = useRef(annotationTasks.items);
  itemsRef.current = annotationTasks.items;
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

  const activeTaskId =
    activeOpen && typeof focusedElement === "number" && focusedElement >= 0
      ? annotationTasks.items[focusedElement]?.id ?? null
      : null;

  // Don't request spectrograms for rows the cursor only passes through.
  const [activeSettled, setActiveSettled] = useState(true);
  useEffect(() => {
    setActiveSettled(false);
    const timer = setTimeout(() => setActiveSettled(true), PREVIEW_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [activeTaskId]);

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
    (index: number) => {
      const task = itemsRef.current[index];
      if (!task) return;
      setFocusedElement(index);
      setActiveOpen(true);
      pendingScrollIdRef.current = task.id;
    },
    [setFocusedElement, setActiveOpen],
  );

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === LIST_OVERVIEW_DOWN_SHORTCUT) {
      e.preventDefault();
      if (annotationTasks.items.length > 0) {
        moveCursorTo(0);
        searchInputRef.current?.blur();
      }
    }
  }, [annotationTasks.items.length, moveCursorTo]);

  const handleRowClick = useCallback(
    (task: AnnotationTask, { index }: { index: number }) => {
      if (cursorRef.current === index) {
        // Clicking the current row closes its preview (pinned or not)
        updatePinned((prev) => prev.filter((id) => id !== task.id));
        setActiveOpen(!activeOpenRef.current || pinnedRef.current.includes(task.id));
      } else {
        setFocusedElement(index);
        setActiveOpen(true);
      }
    },
    [setFocusedElement, setActiveOpen, updatePinned],
  );

  // One keyboard handler for moving the cursor, pinning and ticking the
  // current row. It only reads refs, so it is registered once and never stale.
  //   ArrowUp / ArrowDown  move the cursor (its preview follows, the page scrolls)
  //   p                    pin / unpin the current row's preview
  //   Shift (tap)          tick / untick the checkbox of the current row
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const cursor = cursorRef.current;
      if (typeof cursor !== "number" || cursor < 0) return;
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
        const next = event.key === "ArrowDown"
          ? Math.min(items.length - 1, cursor + 1)
          : cursor - 1;
        if (next < 0) {
          setFocusedElement("search");
          searchInputRef.current?.focus();
        } else if (next !== cursor) {
          moveCursorTo(next);
        }
        return;
      }

      const current = items[cursor];
      if (!current) return;

      if (event.key === PIN_PREVIEW_SHORTCUT && !event.shiftKey) {
        togglePin(current.id);
        return;
      }

      if (event.key === "Shift" && !event.repeat) {
        const previewOpen = activeOpenRef.current || pinnedRef.current.includes(current.id);
        if (!previewOpen) return;
        handleRowSelectionChange((prev) => {
          const next = { ...prev };
          const id = String(current.id);
          if (next[id]) delete next[id];
          else next[id] = true;
          return next;
        });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [moveCursorTo, setFocusedElement, togglePin, handleRowSelectionChange]);

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
        />
      );
    },
    [pinnedIds, activeTaskId, activeSettled, togglePin],
  );

  if (annotationTasks.isLoading || annotationTasks.data == null) {
    return <Loading />;
  }
  return (
    <div className="flex flex-col gap-y-4">
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
          <FilterPopover
            filter={annotationTasks.filter}
            filterDef={tasksFilterDefs}
            button={btn}
          />
          <FilterPresets
            storageKey="presets:annotation_tasks"
            filter={annotationTasks.filter}
            normalizeForPreset={normalizeDateRangeForPreset}
          />
          <ShortcutHelper shortcuts={TASK_TABLE_SHORTCUTS} />
        </div>
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
      <FilterBar
        filter={annotationTasks.filter}
        total={annotationTasks.total}
        filterDef={tasksFilterDefs}
      />
      {showBulkBar && (
        <div ref={bulkBarRef} className="sticky top-0 z-30 rounded-md bg-stone-100 shadow-md dark:bg-stone-900">
        <AnnotationTaskBulkActionBar
          targetMode={targetMode}
          selectedTaskIds={selectedTaskIds}
          filterTotal={annotationTasks.total}
          currentPageTaskIds={currentPageTaskIds}
          soundEventTagCounts={bulkTagSummaryQuery.data ?? []}
          isTagSummaryLoading={bulkTagSummaryQuery.isLoading}
          bulkAddBadge={bulkActions.bulkAddBadge}
          bulkAddTag={bulkActions.bulkAddTag}
          bulkReplaceSoundEventTags={bulkActions.bulkReplaceSoundEventTags}
          bulkDeleteSoundEventsByTag={bulkActions.bulkDeleteSoundEventsByTag}
          onClearSelection={handleClearBulkSelection}
          onTagBulkPanelOpenChange={handleTagBulkPanelOpenChange}
        />
        </div>
      )}
      <div className="w-full">
        <div className="w-full min-w-0 overflow-x-auto rounded-md outline outline-1 outline-stone-200 dark:outline-stone-800">
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
            handleNumberKeys={
              focusedElement !== 'search'
              && focusedElement !== 'filter'
              && selectedTaskIds.length === 0
              && targetMode !== 'filter_all'
            }
          />
        </div>
      </div>
      <Pagination {...annotationTasks.pagination} />
    </div>
  );
}