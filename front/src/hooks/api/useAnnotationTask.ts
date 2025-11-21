import { type AxiosError } from "axios";

import api from "@/app/api";
import useObject from "@/hooks/utils/useObject";

import type { AnnotationTask } from "@/types";
import useSoundEventMutations from "./useSoundEventMutations";

export default function useAnnotationTask({
  id,
  annotationTask,
  enabled = true,
  onError,
  include_recording = false,
  include_annotation_project = false,
  include_sound_event_annotations = false,
  include_sound_event_tags = false,
  include_tags = false,
  include_notes = false,
  include_features = false,
  include_status_badges = true,
  include_status_badge_users = true,
  include_sound_event_annotation_features = false,
  include_sound_event_annotation_users = false,
  include_note_users = false,
}: {
  id: number;
  annotationTask?: AnnotationTask;
  onError?: (error: AxiosError) => void;
  enabled?: boolean;
  include_recording?: boolean;
  include_annotation_project?: boolean;
  include_sound_event_annotations?: boolean;
  include_sound_event_tags?: boolean;
  include_tags?: boolean;
  include_notes?: boolean;
  include_features?: boolean;
  include_status_badges?: boolean;
  include_status_badge_users?: boolean;
  include_sound_event_annotation_features?: boolean;
  include_sound_event_annotation_users?: boolean;
  include_note_users?: boolean;
}) {
  const { query, setData, client, useMutation, useDestruction } =
    useObject<AnnotationTask>({
      id,
      initial: annotationTask,
      name: "annotation_task",
      enabled,
      getFn: (taskId) => api.annotationTasks.get(taskId, {
        recording: include_recording,
        annotation_project: include_annotation_project,
        sound_event_annotations: include_sound_event_annotations,
        sound_event_tags: include_sound_event_tags,
        tags: include_tags,
        notes: include_notes,
        features: include_features,
        status_badges: include_status_badges,
        status_badge_users: include_status_badge_users,
        sound_event_annotation_features: include_sound_event_annotation_features,
        sound_event_annotation_users: include_sound_event_annotation_users,
        note_users: include_note_users,
      }),
      onError,
    });

  const deleteTask = useDestruction({
    mutationFn: api.annotationTasks.delete,
  });

  const addBadge = useMutation({
    mutationFn: api.annotationTasks.addBadge,
    onSuccess: () => {
      // Invalidate stats queries to refresh the remaining tasks count
      client.invalidateQueries({ queryKey: ["annotation_tasks_stats"] });
      // Invalidate task list queries to refresh badges in the table
      client.invalidateQueries({ queryKey: ["annotation_tasks"] });
      // Invalidate task index queries to ensure navigation stays in sync
      client.invalidateQueries({ queryKey: ["annotation_tasks_index"] });
    },
  });

  const removeBadge = useMutation({
    mutationFn: api.annotationTasks.removeBadge,
    onSuccess: () => {
      // Invalidate stats queries to refresh the remaining tasks count
      client.invalidateQueries({ queryKey: ["annotation_tasks_stats"] });
      // Invalidate task list queries to refresh badges in the table
      client.invalidateQueries({ queryKey: ["annotation_tasks"] });
      // Invalidate task index queries to ensure navigation stays in sync
      client.invalidateQueries({ queryKey: ["annotation_tasks_index"] });
    },
  });

  const addNote = useMutation({
    mutationFn: api.annotationTasks.addNote,
  });

  const removeNote = useMutation({
    mutationFn: api.annotationTasks.removeNote,
  });

  const addTag = useMutation({
    mutationFn: api.annotationTasks.addTag,
    onSuccess: () => {
      // Invalidate task list queries to refresh tags in the table
      client.invalidateQueries({ queryKey: ["annotation_tasks"] });
    },
  });

  const removeTag = useMutation({
    mutationFn: api.annotationTasks.removeTag,
    onSuccess: () => {
      // Invalidate task list queries to refresh tags in the table
      client.invalidateQueries({ queryKey: ["annotation_tasks"] });
    },
  });

  const {
    addSoundEventAnnotation,
    updateSoundEventAnnotation,
    removeSoundEventAnnotation,
    addTagToSoundEventAnnotation,
    removeTagFromSoundEventAnnotation
  } = useSoundEventMutations({getData: () => query.data, setData, client, onError})

  return {
    ...query,
    addBadge,
    removeBadge,
    addNote,
    removeNote,
    delete: deleteTask,
    addTag,
    removeTag,
    addSoundEventAnnotation,
    updateSoundEventAnnotation,
    removeSoundEventAnnotation,
    addTagToSoundEventAnnotation,
    removeTagFromSoundEventAnnotation,
  } as const;
}
