import {
  type UseMutationResult,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { type AxiosError } from "axios";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import useStore from "@/store";

import {
  AnnotationTaskFilter,
  type AnnotationTaskPage,
} from "@/api/annotation_tasks";
import api from "@/app/api";
import useAnnotateTasksKeyShortcuts from "@/hooks/annotation/useTaskStatusKeyShortcuts";
import useAnnotationTasks from "@/hooks/api/useAnnotationTasks";
import { type Filter } from "@/hooks/utils/useFilter";

import type { AnnotationStatus, Recording, AnnotationTask } from "@/types";

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
  /** Mark the current task as completed */
  markCompleted: UseMutationResult<AnnotationTask, AxiosError, void>;
  /** Mark the current task as unsure */
  markUnsure: UseMutationResult<AnnotationTask, AxiosError, void>;
  /** Mark the current task as rejected */
  markRejected: UseMutationResult<AnnotationTask, AxiosError, void>;
  /** Mark the current task as verified */
  markVerified: UseMutationResult<AnnotationTask, AxiosError, void>;
  /** Remove a badge from the current task */
  removeBadge: UseMutationResult<AnnotationTask, AxiosError, { state: AnnotationStatus, userId?: string }>;
};

const empty = {};

export default function useAnnotateTasks({
  filter: initialFilter = empty,
  annotationTask: initialTask,
  onChangeTask,
  onCompleteTask,
  onUnsureTask,
  onRejectTask,
  onVerifyTask,
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


  const parameters = useStore((state) => state.spectrogramSettings);

  const goToTask = useCallback(
    (task: AnnotationTask) => {
      client.setQueryData(["annotation_task", task.id], task);
      setCurrentTask(task);
      onChangeTask?.(task);
      onDeselectSoundEventAnnotation();
    },
    [onChangeTask, client, onDeselectSoundEventAnnotation],
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

    // try {
    //   const completeData = await api.annotationTasks.get(nextTask.id);
    //   if (!completeData.recording) return;
  
    //   //await preloadSpectrogramSegments(completeData.recording);
    // } catch (error) {
    //   console.error('Failed to preload next task:', error);
    // }

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


  const updateTaskData = useCallback(
    (task: AnnotationTask) => {
      client.setQueryData(["annotation_task", task.id], task);
      client.setQueryData(queryKey, (old: AnnotationTaskPage) => {
        if (old == null) return old;
        return {
          ...old,
          items: old.items.map((item) => {
            if (item.id === task.id) {
              return task;
            }
            return item;
          }),
        };
      });
      setCurrentTask(task);
    },
    [client, queryKey],
  );

  const markCompletedFn = useCallback(async () => {
    if (currentTask == null) {
      throw new Error("No selected task");
    }
    return api.annotationTasks.addBadge(currentTask, "completed");
  }, [currentTask]);

  const markCompleted = useMutation<AnnotationTask, AxiosError>({
    mutationFn: markCompletedFn,
    onSuccess: (task) => {
      let updatedTask = task;
      onCompleteTask?.(updatedTask);
      updateTaskData(updatedTask);
      nextTask();
    },
  });

  const markUnsureFn = useCallback(async () => {
    if (currentTask == null) {
      throw new Error("No selected task");
    }
    return api.annotationTasks.addBadge(currentTask, "assigned");
  }, [currentTask]);

  const markUnsure = useMutation<AnnotationTask, AxiosError>({
    mutationFn: markUnsureFn,
    onSuccess: (task) => {
      let updatedTask = task;
      onUnsureTask?.(updatedTask);
      updateTaskData(updatedTask);
      nextTask();
    },
  });

  const markRejectedFn = useCallback(async () => {
    if (currentTask == null) {
      throw new Error("No selected task");
    }
    return api.annotationTasks.addBadge(currentTask, "rejected");
  }, [currentTask]);

  const markRejected = useMutation<AnnotationTask, AxiosError>({
    mutationFn: markRejectedFn,
    onSuccess: (task) => {
      let updatedTask = task;
      onRejectTask?.(updatedTask);
      updateTaskData(updatedTask);
      nextTask();
    },
  });

  const markVerifiedFn = useCallback(async () => {
    if (currentTask == null) {
      throw new Error("No selected task");
    }
    return api.annotationTasks.addBadge(currentTask, "verified");
  }, [currentTask]);

  const markVerified = useMutation<AnnotationTask, AxiosError>({
    mutationFn: markVerifiedFn,
    onSuccess: (task) => {
      let updatedTask = task;
      onVerifyTask?.(updatedTask);
      updateTaskData(updatedTask);
      nextTask();
    },
  });

  const removeBadgeFn = useCallback(
    async (status: AnnotationStatus, userId?: string) => {
      if (currentTask == null) {
        throw new Error("No selected task");
      }
      return api.annotationTasks.removeBadge(currentTask, status, userId);
    },
    [currentTask],
  );

  const removeBadge = useMutation<AnnotationTask, AxiosError, { state: AnnotationStatus, userId?: string }>(
    {
      mutationFn: ({ state, userId }) => removeBadgeFn(state, userId),
      onSuccess: (task) => {
        updateTaskData(task);
      },
    },
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

  useAnnotateTasksKeyShortcuts({
    onGoNext: nextTask,
    onGoPrevious: prevTask,
    onMarkCompleted: markCompleted.mutate,
    onMarkUnsure: markUnsure.mutate,
    onMarkRejected: markRejected.mutate,
    onMarkVerified: markVerified.mutate,
  });

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
    markCompleted,
    markUnsure,
    markRejected,
    markVerified,
    removeBadge,
    getFirstTask,
    handleCurrentSegmentsLoaded,
    _filter: filter,
  };
}
