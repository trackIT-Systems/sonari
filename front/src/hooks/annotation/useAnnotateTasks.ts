import {
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";

import {
  AnnotationTaskFilter,
  type AnnotationTaskPage,
} from "@/api/annotation_tasks";
import useAnnotationTaskIndex from "@/hooks/api/useAnnotationTaskIndex";
import useAnnotationTaskStats from "@/hooks/api/useAnnotationTaskStats";
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
};

const empty = {};

export default function useAnnotateTasks({
  filter: initialFilter = empty,
  annotationTask: initialTask,
  onChangeTask,
  onDeselectSoundEventAnnotation,
}: {
  /** Initial filter to select which annotation tasks to show */
  filter?: AnnotationTaskFilter;
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
  const client = useQueryClient();

  // Fetch minimal task index for navigation
  const {
    items: indexItems,
    filter,
    isLoading: isLoadingIndex,
    isError: isErrorIndex,
    queryKey: indexQueryKey,
  } = useAnnotationTaskIndex({
    pageSize: -1,
    filter: initialFilter,
    fixed: Object.keys(initialFilter) as (keyof AnnotationTaskFilter)[],
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

  const index = useMemo(() => {
    if (currentTask === null) return -1;
    return items.findIndex((item) => item.id === currentTask.id);
  }, [currentTask, items]);

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
    return items.length > 0;
  }, [index, items.length]);

  const nextTask = useCallback(() => {
    if (!hasNextTask) return;
    const nextIndex = index === -1 ? 0 : index + 1;
    const nextTaskIndex = items[nextIndex];
    // Cast minimal index to AnnotationTask for navigation
    // Only id is actually used by onChangeTask
    goToTask(nextTaskIndex as unknown as AnnotationTask);
  }, [index, items, hasNextTask, goToTask]);

  const hasPrevTask = useMemo(() => {
    if (index !== -1) {
      return index > 0;
    }
    return items.length > 0;
  }, [index, items.length]);

  const prevTask = useCallback(() => {
    if (!hasPrevTask) return;
    const prevIndex = index === -1 ? 0 : index - 1;
    const prevTaskIndex = items[prevIndex];
    // Cast minimal index to AnnotationTask for navigation
    // Only id is actually used by onChangeTask
    goToTask(prevTaskIndex as unknown as AnnotationTask);
  }, [index, items, hasPrevTask, goToTask]);

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

  useEffect(() => {
    if (currentTask == null && items.length > 0) {
      // Cast minimal index to AnnotationTask for navigation
      goToTask(items[0] as unknown as AnnotationTask);
    }
  }, [currentTask, items, goToTask]);

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
    handleCurrentSegmentsLoaded,
    _filter: filter,
  };
}
