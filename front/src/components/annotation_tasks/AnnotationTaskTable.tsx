import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RowSelectionState, OnChangeFn } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
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
import { LIST_OVERVIEW_DOWN_SHORTCUT, SEARCH_BAR_LEAVE_SHORTCUT, FILTER_POPOVER_SHORTCUT } from "@/utils/keyboard";
import AnnotationTaskSpectrogramPreview from "@/components/annotation_tasks/AnnotationTaskSpectrogramPreview";
import { findTemporallyRelatedTasks } from "@/utils/temporalClusters";
import Button from "../Button";
import { FilterIcon } from "../icons";

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
  const [focusedElement, setFocusedElement] = useState<'search' | 'filter' | number>(-1);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [targetMode, setTargetMode] = useState<"selected" | "filter_all">("selected");
  const [tagBulkPanelsOpen, setTagBulkPanelsOpen] = useState<Record<TagBulkPanel, boolean>>({
    replace: false,
    addToTagged: false,
    deleteSoundEvents: false,
  });
  const anyTagBulkPanelOpen = Object.values(tagBulkPanelsOpen).some(Boolean);
  const router = useRouter();
  const popoverButtonRef = useRef<HTMLButtonElement>(null);
  const [highlightRelated, setHighlightRelated] = useState(true);
  const [relatedWindow, setRelatedWindow] = useState(5);
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<number>>(new Set());

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
    enabled: showBulkBar && anyTagBulkPanelOpen,
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

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === LIST_OVERVIEW_DOWN_SHORTCUT) {
      e.preventDefault();
      if (annotationTasks.items.length > 0) {
        setFocusedElement(0);
        searchInputRef.current?.blur();
      }
    }
  }, [annotationTasks.items]);

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
      router.push(`/annotation_projects/${link}`);
    }
  }, [router, getAnnotationTaskLink]);

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

  const toggleExpandedTask = useCallback((task: AnnotationTask) => {
    setExpandedTaskIds((prev) => {
      const next = new Set(prev);
      if (!next.delete(task.id)) next.add(task.id);
      return next;
    });
  }, []);

  const renderExpandedRow = useCallback(
    (task: AnnotationTask) =>
      expandedTaskIds.has(task.id)
        ? <AnnotationTaskSpectrogramPreview task={task} />
        : null,
    [expandedTaskIds],
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
        <AnnotationTaskBulkActionBar
          targetMode={targetMode}
          selectedTaskIds={selectedTaskIds}
          filterTotal={annotationTasks.total}
          currentPageTaskIds={currentPageTaskIds}
          soundEventTagCounts={bulkTagSummaryQuery.data ?? []}
          isTagSummaryLoading={bulkTagSummaryQuery.isLoading}
          bulkAddBadge={bulkActions.bulkAddBadge}
          bulkReplaceSoundEventTags={bulkActions.bulkReplaceSoundEventTags}
          bulkDeleteSoundEventsByTag={bulkActions.bulkDeleteSoundEventsByTag}
          onClearSelection={handleClearBulkSelection}
          onTagBulkPanelOpenChange={handleTagBulkPanelOpenChange}
        />
      )}
      <div className="w-full">
        <div className="w-full min-w-0 overflow-x-auto rounded-md outline outline-1 outline-stone-200 dark:outline-stone-800">
          <Table
            table={table}
            selectedIndex={typeof focusedElement === 'number' ? focusedElement : -1}
            onFocusChange={handleTableFocus}
            onSelect={handleSelect}
            getRowClassName={getRowClassName}
            onRowClick={toggleExpandedTask}
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