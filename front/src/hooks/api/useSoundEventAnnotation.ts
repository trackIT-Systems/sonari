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
}: {
  id: number;
  annotationTask: AnnotationTask;
  soundEventAnnotation?: SoundEventAnnotation;
  onDelete?: (annotation: SoundEventAnnotation) => void;
  onUpdate?: (annotation: SoundEventAnnotation) => void;
  onError?: (error: AxiosError) => void;
  enabled?: boolean;
}) {
  const { query, useMutation, useDestruction, client } =
    useObject<SoundEventAnnotation>({
      name: "sound_event_annotation",
      id,
      initial: soundEventAnnotation,
      enabled,
      getFn: api.soundEventAnnotations.get,
      onError,
    });

  const updateSoundEventAnnotation = useCallback(
    (annotation: SoundEventAnnotation) => {
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
