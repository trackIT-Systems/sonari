import { useCallback, useEffect, useMemo, useState, useRef } from "react";

import { AnnotationTaskFilter } from "@/api/annotation_tasks";
import useAnnotationTaskIndex from "@/hooks/api/useAnnotationTaskIndex";
import useAnnotationTaskStats from "@/hooks/api/useAnnotationTaskStats";
import { reconcileAnnotationTaskIndex } from "@/hooks/annotation/reconcileAnnotationTaskIndex";
import { annotationTaskFilterPersistKey } from "@/hooks/utils/annotationTaskFilterPersistKey";
import { type Filter } from "@/hooks/utils/useFilter";

import type { AnnotationTask, AnnotationTaskIndex, AnnotationTaskStats } from "@/types";

type AnnotationState = {
  /** Currently selected annotation task index */
  current: number | null;
  /** Currently selected annotation task */
  task: AnnotationTask | null;
  /** Filter used to select which annotation tasks to show */
  filter: AnnotationTaskFilter;
  /** List of annotation task indices (minimal data for navigation) */
  tasks: AnnotationTaskIndex[];
  /** Aggregate statistics for annotation tasks */
  stats?: AnnotationTaskStats;
  /** Whether the annotation tasks are currently being fetched */
  isLoading: boolean;
  /** Whether there was an error fetching the annotation tasks */
  isError: boolean;
  /** Whether there is a next annotation task */
  hasNextTask: boolean;
  /** Whether there is a previous annotation task */
  hasPrevTask: boolean;
  /** Id of the linked task when it is not matched by the active filter */
  filterMismatchTaskId: number | null;
  _filter: Filter<AnnotationTaskFilter>;
  handleCurrentSegmentsLoaded: () => void;
};

type AnnotationControls = {
  /** Select a specific annotation task */
  goToTask: (task: AnnotationTask) => void;
  /** Select the next annotation task */
  nextTask: () => void;
  /** Select the previous annotation task */
  prevTask: () => void;
  /** Change the filter used to select which annotation tasks to show */
  setFilter: <T extends keyof AnnotationTaskFilter>(
    key: T,
    value: AnnotationTaskFilter[T],
  ) => void;
  /** Select a random annotation task */
  getFirstTask: () => void;
  /** Resolve the filter mismatch by switching to the first filtered task */
  applyFilterForMismatch: () => void;
  /** Resolve the filter mismatch by staying on the task from the link */
  keepOriginalTask: () => void;
};

const empty = {};

export default function useAnnotateTasks({
  filter: initialFilter = empty,
  annotationTask: initialTask,
  onChangeTask,
  onDeselectSoundEventAnnotation,
  persistFilter = true,
}: {
  /** Initial filter to select which annotation tasks to show */
  filter?: AnnotationTaskFilter;
  /**
   * Share the project's saved filter with the tasks table (default). Off in
   * guided tours: a table filter from the bulk lesson must not change which
   * task comes next in the lessons.
   */
  persistFilter?: boolean;
  /** Optional, initial annotation task to select */
  annotationTask?: AnnotationTask;
  /** Callback when the selected annotation task changes */
  onChangeTask?: (task: AnnotationTask) => void;
  /** Callback when the current task is marked as completed */
  onCompleteTask?: (task: AnnotationTask) => void;
  /** Callback when the current task is marked as completed */
  onUnsureTask?: (task: AnnotationTask) => void;
  /** Callback when the current task is marked as rejected */
  onRejectTask?: (task: AnnotationTask) => void;
  /** Callback when the current task is marked as verified */
  onVerifyTask?: (task: AnnotationTask) => void;
  /** Set current annotation to null */
  onDeselectSoundEventAnnotation: () => void;
}): AnnotationState & AnnotationControls {
  const [currentTask, setCurrentTask] = useState<AnnotationTask | null>(
    initialTask ?? null,
  );
  /** Target id from a reconcile navigation until the URL task catches up */
  const pendingReconcileTaskIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (initialTask != null && initialTask.id === pendingReconcileTaskIdRef.current) {
      pendingReconcileTaskIdRef.current = null;
    }
  }, [initialTask?.id]);

  const filterPersistKey = useMemo(
    () => (persistFilter ? annotationTaskFilterPersistKey(initialFilter.annotation_project?.id) : undefined),
    [persistFilter, initialFilter.annotation_project?.id],
  );

  // Fetch minimal task index for navigation
  const {
    items: indexItems,
    filter,
    isLoading: isLoadingIndex,
    isFetching: isFetchingIndex,
    isError: isErrorIndex,
    queryKey: indexQueryKey,
    dataUpdatedAt: indexUpdatedAt,
    refetch: refetchIndex,
  } = useAnnotationTaskIndex({
    pageSize: -1,
    filter: initialFilter,
    fixed: Object.keys(initialFilter) as (keyof AnnotationTaskFilter)[],
    persistKey: filterPersistKey,
  });

  // Fetch aggregate statistics using the current filter state
  const {
    stats,
    isLoading: isLoadingStats,
    isError: isErrorStats,
  } = useAnnotationTaskStats({
    filter: filter.filter,
  });

  const isLoading = isLoadingIndex || isLoadingStats;
  const isError = isErrorIndex || isErrorStats;
  const items = indexItems;

  // Keep local selection aligned with the URL when it points at a filtered task
  // (e.g. browser back). Do not pull back a task that is excluded by the filter.
  useEffect(() => {
    if (initialTask == null) {
      return;
    }
    if (pendingReconcileTaskIdRef.current != null) {
      return;
    }
    if (initialTask.id === currentTask?.id) {
      return;
    }
    if (!items.some((item) => item.id === initialTask.id)) {
      return;
    }
    setCurrentTask(initialTask);
  }, [initialTask, currentTask?.id, items]);

  const index = useMemo(() => {
    if (currentTask === null) return -1;
    return items.findIndex((item) => item.id === currentTask.id);
  }, [currentTask, items]);

  // Where the open task last sat in the settled index. A tag or status edit
  // can filter the open task out; it then stays open, and next/prev continue
  // from this slot. Only settled data counts, so a filter change (new key)
  // still jumps to the first match.
  const filterKey = JSON.stringify(filter.filter);
  const [lastPosition, setLastPosition] = useState<{
    taskId: number;
    index: number;
    filterKey: string;
  } | null>(null);

  useEffect(() => {
    if (index === -1 || currentTask == null || isLoading || isFetchingIndex) {
      return;
    }
    setLastPosition((prev) =>
      prev?.taskId === currentTask.id && prev.index === index && prev.filterKey === filterKey
        ? prev
        : { taskId: currentTask.id, index, filterKey },
    );
  }, [index, currentTask, isLoading, isFetchingIndex, filterKey]);

  /** Slot of the open task after an edit filtered it out of the index */
  const filteredOutIndex =
    index === -1 &&
    currentTask != null &&
    lastPosition?.taskId === currentTask.id &&
    lastPosition.filterKey === filterKey
      ? lastPosition.index
      : null;

  const goToTask = useCallback(
    (task: AnnotationTask) => {
      setCurrentTask(task);
      onChangeTask?.(task);
      onDeselectSoundEventAnnotation();
    },
    [onChangeTask, onDeselectSoundEventAnnotation],
  );

  const hasNextTask = useMemo(() => {
    if (index !== -1) {
      return index < items.length - 1;
    }
    if (filteredOutIndex != null) {
      return filteredOutIndex < items.length;
    }
    return items.length > 0;
  }, [index, items.length, filteredOutIndex]);

  const nextTask = useCallback(() => {
    if (!hasNextTask) return;
    // The task after a filtered-out one has moved up into its slot
    const nextIndex = index !== -1 ? index + 1 : filteredOutIndex ?? 0;
    const nextTaskIndex = items[nextIndex];
    // Cast minimal index to AnnotationTask for navigation
    // Only id is actually used by onChangeTask
    goToTask(nextTaskIndex as unknown as AnnotationTask);
  }, [index, items, hasNextTask, goToTask, filteredOutIndex]);

  const hasPrevTask = useMemo(() => {
    if (index !== -1) {
      return index > 0;
    }
    if (filteredOutIndex != null) {
      return filteredOutIndex > 0 && items.length > 0;
    }
    return items.length > 0;
  }, [index, items.length, filteredOutIndex]);

  const prevTask = useCallback(() => {
    if (!hasPrevTask) return;
    const prevIndex =
      index !== -1
        ? index - 1
        : filteredOutIndex != null
          ? Math.min(filteredOutIndex, items.length) - 1
          : 0;
    const prevTaskIndex = items[prevIndex];
    // Cast minimal index to AnnotationTask for navigation
    // Only id is actually used by onChangeTask
    goToTask(prevTaskIndex as unknown as AnnotationTask);
  }, [index, items, hasPrevTask, goToTask, filteredOutIndex]);

  const loadedTasksRef = useRef<Set<number>>(new Set());
  //const handleCurrentSegmentsLoaded = useCallback(() => {}, []);
  const handleCurrentSegmentsLoaded = useCallback(async () => {
    if (!items || index === -1 || index >= items.length - 1) return;
    if (!hasNextTask) return;

    const nextTask = items[index + 1];
    if (loadedTasksRef.current.has(nextTask.id)) return;
    loadedTasksRef.current.add(nextTask.id);

  }, [items, index, hasNextTask]);

  const { set: setFilterKeyValue } = filter;
  const setFilter = useCallback(
    <T extends keyof AnnotationTaskFilter>(
      key: T,
      value: AnnotationTaskFilter[T],
    ) => {
      setFilterKeyValue(key, value);
    },
    [setFilterKeyValue],
  );

  const getFirstTask = useCallback(() => {
    if (items.length === 0) return;
    const taskIndex = items[0];
    // Cast minimal index to AnnotationTask for navigation
    const task = taskIndex as unknown as AnnotationTask;
    setCurrentTask(task);
    onChangeTask?.(task);
  }, [items, onChangeTask]);

  // The task from the link is not part of the (persisted) filter results. Ask
  // the user instead of silently jumping to another task. Checked once.
  const mismatchCheckedRef = useRef(false);
  /** Task id the reconcile step must leave alone */
  const heldTaskIdRef = useRef<number | null>(null);
  const [filterMismatchTaskId, setFilterMismatchTaskId] = useState<number | null>(null);
  const mountedAtRef = useRef(Date.now());
  const revalidatedRef = useRef(false);

  useEffect(() => {
    if (mismatchCheckedRef.current || isLoading || isFetchingIndex || initialTask == null) {
      return;
    }
    if (items.length === 0) {
      return;
    }
    if (items.some((item) => item.id === initialTask.id)) {
      mismatchCheckedRef.current = true;
      heldTaskIdRef.current = null;
      return;
    }
    // The index may come from the cache, loaded before this page opened: a
    // tour reset, for example, recreates every task with new ids under the
    // same query key. Refetch once before blaming the filter, and hold the
    // task meanwhile so the reconcile step does not jump to a stale task.
    if (!revalidatedRef.current && indexUpdatedAt < mountedAtRef.current) {
      revalidatedRef.current = true;
      heldTaskIdRef.current = initialTask.id;
      void refetchIndex();
      return;
    }
    mismatchCheckedRef.current = true;
    heldTaskIdRef.current = initialTask.id;
    setFilterMismatchTaskId(initialTask.id);
  }, [isLoading, isFetchingIndex, initialTask, items, indexUpdatedAt, refetchIndex]);

  const applyFilterForMismatch = useCallback(() => {
    heldTaskIdRef.current = null;
    setFilterMismatchTaskId(null);
  }, []);

  const keepOriginalTask = useCallback(() => {
    setFilterMismatchTaskId(null);
  }, []);

  useEffect(() => {
    if (
      heldTaskIdRef.current != null &&
      heldTaskIdRef.current === currentTask?.id
    ) {
      return;
    }
    const action = reconcileAnnotationTaskIndex({
      currentTaskId: currentTask?.id ?? null,
      itemIds: items.map((item) => item.id),
      isLoading,
      wasListed: filteredOutIndex != null,
    });
    if (action !== "go_to_first") {
      return;
    }
    const first = items[0];
    if (first == null) {
      return;
    }
    if (currentTask?.id === first.id) {
      return;
    }
    if (pendingReconcileTaskIdRef.current === first.id) {
      return;
    }
    pendingReconcileTaskIdRef.current = first.id;
    goToTask(first as unknown as AnnotationTask);
  }, [currentTask, items, isLoading, goToTask, filterMismatchTaskId, filteredOutIndex]);

  return {
    current: index,
    task: currentTask,
    filter: filter.filter,
    tasks: items,
    stats: stats,
    isLoading,
    isError,
    goToTask,
    hasNextTask,
    hasPrevTask,
    nextTask,
    prevTask,
    setFilter,
    getFirstTask,
    applyFilterForMismatch,
    keepOriginalTask,
    filterMismatchTaskId,
    handleCurrentSegmentsLoaded,
    _filter: filter,
  };
}
