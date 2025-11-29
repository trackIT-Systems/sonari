import { useCallback, useMemo } from "react";

import api from "@/app/api";
import useObject from "@/hooks/utils/useObject";

import type { AnnotationTask, SoundEventAnnotation } from "@/types";
import type { AxiosError } from "axios";

/**
 * A hook for managing the state of a sound event annotation.
 */
export default function useSoundEventAnnotation({
  id,
  soundEventAnnotation,
  annotationTask,
  onDelete,
  onUpdate,
  onError,
  enabled = true,
  includeTags = false,
  includeFeatures = false,
  includeCreatedBy = false,
}: {
  id: number;
  annotationTask: AnnotationTask;
  soundEventAnnotation?: SoundEventAnnotation;
  onDelete?: (annotation: SoundEventAnnotation) => void;
  onUpdate?: (annotation: SoundEventAnnotation) => void;
  onError?: (error: AxiosError) => void;
  enabled?: boolean;
  includeTags?: boolean;
  includeFeatures?: boolean;
  includeCreatedBy?: boolean;
}) {
  const getFn = useCallback(
    (id: number) =>
      api.soundEventAnnotations.get(id, {
        tags: includeTags,
        features: includeFeatures,
        created_by: includeCreatedBy,
      }),
    [includeTags, includeFeatures, includeCreatedBy],
  );

  const { query, useMutation, useDestruction, client } =
    useObject<SoundEventAnnotation>({
      name: "sound_event_annotation",
      id,
      initial: soundEventAnnotation,
      enabled,
      getFn,
      onError,
    });

  const updateSoundEventAnnotation = useCallback(
    (annotation: SoundEventAnnotation) => {
      // Update the individual sound event annotation cache
      // Merge with existing cache to preserve relationships like features, created_by
      client.setQueryData(["sound_event_annotation", annotation.id], (oldData: SoundEventAnnotation | undefined) => {
        if (!oldData) return annotation;
        // Merge: keep old relationships that aren't in the new data
        return {
          ...oldData,
          ...annotation,
          // Preserve these if they exist in old data but not in new
          features: annotation.features ?? oldData.features,
          created_by: annotation.created_by ?? oldData.created_by,
        };
      });
      
      // Update the annotation task cache
      client.setQueryData(
        ["annotation_task", annotationTask.id],
        (data: AnnotationTask) => {
          if (data == null) return;
          return {
            ...data,
            sound_event_annotations: data.sound_event_annotations?.map((a) =>
              a.id === annotation.id ? annotation : a,
            ),
          };
        },
      );
    },
    [client, annotationTask],
  );

  const handleUpdate = useCallback(
    (annotation: SoundEventAnnotation) => {
      onUpdate?.(annotation);
      updateSoundEventAnnotation(annotation);
    },
    [onUpdate, updateSoundEventAnnotation],
  );

  const update = useMutation({
    mutationFn: api.soundEventAnnotations.update,
    onSuccess: handleUpdate,
  });

  const handleDelete = useCallback(
    (annotation: SoundEventAnnotation) => {
      onDelete?.(annotation);
      updateSoundEventAnnotation(annotation);
    },
    [onDelete, updateSoundEventAnnotation],
  );

  const delete_ = useDestruction({
    mutationFn: api.soundEventAnnotations.delete,
    onSuccess: handleDelete,
  });

  const handleAddTag = useCallback(
    (annotation: SoundEventAnnotation) => {
      updateSoundEventAnnotation(annotation);
    },
    [updateSoundEventAnnotation],
  );

  const addTag = useMutation({
    mutationFn: api.soundEventAnnotations.addTag,
    onSuccess: handleAddTag,
  });

  const handleRemoveTag = useCallback(
    (annotation: SoundEventAnnotation) => {
      updateSoundEventAnnotation(annotation);
    },
    [updateSoundEventAnnotation],
  );

  const removeTag = useMutation({
    mutationFn: api.soundEventAnnotations.removeTag,
    onSuccess: handleRemoveTag,
  });


  return {
    ...query,
    update,
    delete: delete_,
    addTag,
    removeTag,
  } as const;
}
