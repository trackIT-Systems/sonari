import {
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import useStore from "@/store";

import {
  AnnotationTaskFilter,
  type AnnotationTaskPage,
} from "@/api/annotation_tasks";
import useAnnotationTasks from "@/hooks/api/useAnnotationTasks";
import { type Filter } from "@/hooks/utils/useFilter";

import type { AnnotationTask } from "@/types";

type AnnotationState = {
  /** Currently selected annotation task index */
  current: number | null;
  /** Currently selected annotation task */
  task: AnnotationTask | null;
  /** Filter used to select which annotation tasks to show */
  filter: AnnotationTaskFilter;
  /** List of annotation tasks matching the filter */
  tasks: AnnotationTask[];
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

  // Memoize the filter to prevent infinite re-renders
  const minimalFilter = useMemo(
    () => ({
      ...initialFilter,
      // Explicitly exclude all heavy data for navigation
      // Full data will be loaded when task is selected via useAnnotationTask
      include_recording: false,
      include_status_badges: false,
      include_status_badge_users: false,
      include_tags: false,
      include_notes: false,
      include_sound_event_annotations: false,
      include_sound_event_tags: false,
      include_features: false,
    }),
    [initialFilter],
  );

  const {
    items,
    filter,
    isLoading,
    isError,
    queryKey,
  } = useAnnotationTasks({
    pageSize: -1,
    filter: minimalFilter,
    fixed: Object.keys(initialFilter) as (keyof AnnotationTaskFilter)[],
  });

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
    if (index === -1) {
      goToTask(items[0]);
    } else {
      goToTask(items[index + 1]);
    }
  }, [index, items, hasNextTask, goToTask]);

  const hasPrevTask = useMemo(() => {
    if (index !== -1) {
      return index > 0;
    }
    return items.length > 0;
  }, [index, items.length]);

  const prevTask = useCallback(() => {
    if (!hasPrevTask) return;
    if (index === -1) {
      goToTask(items[0]);
    } else {
      goToTask(items[index - 1]);
    }
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
    const task = items[0];
    setCurrentTask(task);
    onChangeTask?.(task);
  }, [items, onChangeTask]);

  useEffect(() => {
    if (currentTask == null && items.length > 0) {
      goToTask(items[0]);
    }
  }, [currentTask, items, goToTask]);

  return {
    current: index,
    task: currentTask,
    filter: filter.filter,
    tasks: items,
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
