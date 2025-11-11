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
  include_tags = false,
  include_notes = false,
  include_features = false,
  include_status_badges = true,
  include_status_badge_users = true,
}: {
  id: number;
  annotationTask?: AnnotationTask;
  onError?: (error: AxiosError) => void;
  enabled?: boolean;
  include_recording?: boolean;
  include_annotation_project?: boolean;
  include_sound_event_annotations?: boolean;
  include_tags?: boolean;
  include_notes?: boolean;
  include_features?: boolean;
  include_status_badges?: boolean;
  include_status_badge_users?: boolean;
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
        tags: include_tags,
        notes: include_notes,
        features: include_features,
        status_badges: include_status_badges,
        status_badge_users: include_status_badge_users,
      }),
      onError,
    });

  const deleteTask = useDestruction({
    mutationFn: api.annotationTasks.delete,
  });

  const addBadge = useMutation({
    mutationFn: api.annotationTasks.addBadge,
  });

  const removeBadge = useMutation({
    mutationFn: api.annotationTasks.removeBadge,
  });

  const addNote = useMutation({
    mutationFn: api.annotationTasks.addNote,
  });

  const removeNote = useMutation({
    mutationFn: api.annotationTasks.removeNote,
  });

  const addTag = useMutation({
    mutationFn: api.annotationTasks.addTag,
  });

  const removeTag = useMutation({
    mutationFn: api.annotationTasks.removeTag,
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
