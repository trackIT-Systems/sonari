import { type AxiosError } from "axios";
import { useMutation as useQueryMutation } from "@tanstack/react-query";

import api from "@/app/api";
import useObject from "@/hooks/utils/useObject";

import type { AnnotationTask, Geometry, SoundEventAnnotation, Tag } from "@/types";

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
}) {
  const { query, client, setData, useMutation, useDestruction } =
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

  const addSoundEvent = useQueryMutation<
    SoundEventAnnotation,
    AxiosError,
    {
      geometry: Geometry;
      tags: Tag[];
    }
  >({
    mutationFn: ({ geometry, tags }) => {
      if (query.data == null) throw new Error("No annotation task to add the sound event to.");
      return api.soundEventAnnotations.create(query.data, {
        geometry,
        tags,
      });
    },
    onSuccess: (data) => {
      setData((prev) => {
        if (prev == null) throw new Error("No annotation task to add the sound event to on success.");
        return {
          ...prev,
          sound_event_annotations: [...(prev.sound_event_annotations || []), data],
        };
      });
    },
  });

  const updateSoundEvent = useQueryMutation<
    SoundEventAnnotation,
    AxiosError,
    {
      soundEventAnnotation: SoundEventAnnotation;
      geometry: Geometry;
    }
  >({
    mutationFn: ({ soundEventAnnotation, geometry }) => {
      return api.soundEventAnnotations.update(soundEventAnnotation, {
        geometry,
      });
    },
    onSuccess: (data) => {
      client.setQueryData(["sound_event_annotation", data.id], data);
      setData((prev) => {
        if (prev == null) throw new Error("No annotation task to add the sound event annotation to.");
        return {
          ...prev,
          sound_event_annotations: (prev.sound_event_annotations || []).map((soundEventAnnotation) =>
            soundEventAnnotation.id === data.id ? data : soundEventAnnotation,
          ),
        };
      });
    },
  });

  const removeSoundEvent = useQueryMutation<
    SoundEventAnnotation,
    AxiosError,
    SoundEventAnnotation
  >({
    mutationFn: (soundEventAnnotation) => {
      return api.soundEventAnnotations.delete(soundEventAnnotation);
    },
    onSuccess: (data) => {
      setData((prev) => {
        if (prev == null) throw new Error("No annotation task to remove the sound event annotation from.");
        return {
          ...prev,
          sound_event_annotations: (prev.sound_event_annotations || []).filter(
            (soundEventAnnotation) => soundEventAnnotation.id !== data.id,
          ),
        };
      });
    },
  });

  const addTagToSoundEvent = useQueryMutation<
    SoundEventAnnotation,
    AxiosError,
    {
      soundEventAnnotation: SoundEventAnnotation;
      tag: Tag;
    },
    { previousData: AnnotationTask | undefined }
  >({
    mutationFn: ({ soundEventAnnotation, tag }) => {
      // Check if tag already exists before making API call
      const hasTag = soundEventAnnotation.tags?.some(
        existingTag => existingTag.key === tag.key && existingTag.value === tag.value
      );
      
      if (hasTag) {
        throw new Error("Tag already exists");
      }
      
      return api.soundEventAnnotations.addTag(soundEventAnnotation, tag);
    },
    onSuccess: (data) => {
      setData((prev) => {
        if (prev == null) throw new Error("No annotation task to add sound event tag to.");
        return {
          ...prev,
          sound_event_annotations: (prev.sound_event_annotations || []).map((soundEventAnnotation) =>
            soundEventAnnotation.id === data.id ? data : soundEventAnnotation,
          ),
        };
      });
    },
    onError: (error, variables, context) => {
      // Rollback optimistic update on error
      if (context?.previousData) {
        setData(context.previousData);
      }
      // Don't call onError for duplicate tag errors (client-side check)
      if (error.message !== "Tag already exists") {
        onError?.(error);
      }
    },
  });

  const removeTagFromSoundEvent = useQueryMutation<
    SoundEventAnnotation,
    AxiosError,
    {
      soundEventAnnotation: SoundEventAnnotation;
      tag: Tag;
    },
    { previousData: AnnotationTask | undefined }
  >({
    mutationFn: ({ soundEventAnnotation, tag }) => {
      // Check if tag exists before making API call
      const hasTag = soundEventAnnotation.tags?.some(
        existingTag => existingTag.key === tag.key && existingTag.value === tag.value
      );
      
      if (!hasTag) {
        throw new Error("Tag does not exist");
      }
      
      return api.soundEventAnnotations.removeTag(soundEventAnnotation, tag);
    },
    onSuccess: (data) => {
      setData((prev) => {
        if (prev == null) throw new Error("No annotation task to add sound event tag to.");
        return {
          ...prev,
          sound_event_annotations: (prev.sound_event_annotations || []).map((soundEventAnnotation) =>
            soundEventAnnotation.id === data.id ? data : soundEventAnnotation,
          ),
        };
      });
    },
    onError: (error, variables, context) => {
      // Rollback optimistic update on error
      if (context?.previousData) {
        setData(context.previousData);
      }
      
      // Don't call onError for non-existent tag errors (client-side check)
      if (error.message !== "Tag does not exist") {
        onError?.(error);
      }
    },
  });

  return {
    ...query,
    addBadge,
    removeBadge,
    addNote,
    removeNote,
    delete: deleteTask,
    addSoundEvent,
    removeSoundEvent,
    updateSoundEvent,
    addTagToSoundEvent,
    removeTagFromSoundEvent
  } as const;
}
