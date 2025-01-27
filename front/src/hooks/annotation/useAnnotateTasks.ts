import {
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { type AxiosError } from "axios";
import { useCallback, useEffect, useMemo, useState } from "react";
import useStore from "@/store";

import {
  AnnotationTaskFilter,
  type AnnotationTaskPage,
} from "@/api/annotation_tasks";
import api from "@/app/api";
import useAnnotateTasksKeyShortcuts from "@/hooks/annotation/useAnnotateTasksKeyShortcuts";
import useAnnotationTasks from "@/hooks/api/useAnnotationTasks";
import { type Filter } from "@/hooks/utils/useFilter";

import type { AnnotationStatus, Recording, AnnotationTask, ClipAnnotation } from "@/types";
import { spectrogramCache } from "@/utils/spectrogram_cache";
import { getInitialViewingWindow } from "@/utils/windows";
import { getCoveringSegmentDuration, getSegments } from "../spectrogram/useRecordingSegments";

type AnnotationState = {
  /** Currently selected annotation task index */
  current: number | null;
  /** Currently selected annotation task */
  task: AnnotationTask | null;
  /** Clip annotations for the current task */
  annotations: UseQueryResult<ClipAnnotation, AxiosError>;
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
}): AnnotationState & AnnotationControls {
  const [currentTask, setCurrentTask] = useState<AnnotationTask | null>(
    initialTask ?? null,
  );
  const client = useQueryClient();

  const {
    items: initialItems,
    filter,
    isLoading,
    isError,
    queryKey,
  } = useAnnotationTasks({
    pageSize: -1,
    filter: initialFilter,
    fixed: Object.keys(initialFilter) as (keyof AnnotationTaskFilter)[],
  });

  const items = useMemo(() => {
    return initialItems;
  }, [initialItems]);

  const index = useMemo(() => {
    if (currentTask === null) return -1;
    return items.findIndex((item) => item.uuid === currentTask.uuid);
  }, [currentTask, items]);


  const parameters = useStore((state) => state.spectrogramSettings);

  const preloadSpectrogramSegments = useCallback(
    async (recording: Recording) => {
      if (!recording) return;

      // Calculate initial window to get segment size
      const initial = getInitialViewingWindow({
        startTime: 0,
        endTime: recording.duration,
        samplerate: recording.samplerate,
        parameters,
      });

      // Calculate bounds
      const bounds = {
        time: { min: 0, max: recording.duration },
        freq: { min: 0, max: recording.samplerate / 2 },
      };

      // Get segment duration
      const duration = getCoveringSegmentDuration(initial, false);

      // Get all segments
      const segments = getSegments(bounds, duration, 0.4); // 0.4 is the OVERLAP constant

      // Load all segments
      segments.forEach(async segment => {
        // Skip if already cached
        if (spectrogramCache.get(recording.uuid, segment, parameters)) {
          return;
        }

        const url = api.spectrograms.getUrl({
          recording,
          segment: { min: segment.time.min, max: segment.time.max },
          parameters
        });

        try {
          const response = await fetch(url);
          const size = parseInt(response.headers.get('content-length') || '0', 10);
          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);

          const img = new Image();
          img.onload = async () => {
            try {
              await img.decode();
              await spectrogramCache.set(recording.uuid, segment, parameters, img, size);
            } finally {
              URL.revokeObjectURL(objectUrl);
            }
          };

          img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
          };

          img.src = objectUrl;
        } catch (error) {
          console.error('Failed to preload segment:', error);
        }
      });
    },
    [parameters]
  );

  const goToTask = useCallback(
    (task: AnnotationTask) => {
      client.setQueryData(["annotation_task", task.uuid], task);
      setCurrentTask(task);
      onChangeTask?.(task);
    },
    [onChangeTask, client],
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

  useEffect(() => {
    if (!items || index === -1 || index >= items.length - 1) return;

    if (!hasNextTask) return;

    const nextTask = items[index + 1];
    api.annotationTasks.get(nextTask.uuid).then((completeData: AnnotationTask) => {
      if (!completeData.clip?.recording) return;

      // Get recording from next task
      const recording = completeData.clip.recording;

      // Preload segments for next task
      preloadSpectrogramSegments(recording);
    })
  }, [items, index, preloadSpectrogramSegments, hasNextTask]);

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

  const queryFn = useCallback(async () => {
    if (currentTask == null) {
      throw new Error("No selected task");
    }
    return api.annotationTasks.getAnnotations(currentTask);
  }, [currentTask]);

  const annotations = useQuery<ClipAnnotation, AxiosError>({
    queryKey: ["annotation_task", currentTask?.uuid, "annotations"],
    queryFn,
    enabled: currentTask != null,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
    gcTime: 60 * 60 * 1000, // when the gcTime expires, react will re-fetch the data. This might lead to the problem that set filters in annotation task are lost. Therefore, we set a hopefully large enough time.
  });

  const updateTaskData = useCallback(
    (task: AnnotationTask) => {
      client.setQueryData(["annotation_task", task.uuid], task);
      client.setQueryData(queryKey, (old: AnnotationTaskPage) => {
        if (old == null) return old;
        return {
          ...old,
          items: old.items.map((item) => {
            if (item.uuid === task.uuid) {
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
    annotations,
    markCompleted,
    markUnsure,
    markRejected,
    markVerified,
    removeBadge,
    getFirstTask,
    _filter: filter,
  };
}
