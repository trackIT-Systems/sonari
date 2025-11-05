import { useMutation as useQueryMutation } from "@tanstack/react-query";

import api from "@/app/api";
import useObject from "@/hooks/utils/useObject";

import type {
  ClipAnnotation,
  Geometry,
  SoundEventAnnotation,
  Tag,
} from "@/types";
import type { AxiosError } from "axios";

/**
 * A hook for managing the state of a clip annotation.
 */
export default function useClipAnnotation({
  uuid,
  clipAnnotation,
  onDelete,
  onAddTag,
  onRemoveTag,
  onAddNote,
  onRemoveNote,
  onError,
  enabled = true,
}: {
  uuid?: string;
  clipAnnotation?: ClipAnnotation;
  onDelete?: (annotation: ClipAnnotation) => void;
  onAddTag?: (annotation: ClipAnnotation) => void;
  onRemoveTag?: (annotation: ClipAnnotation) => void;
  onAddNote?: (annotation: ClipAnnotation) => void;
  onRemoveNote?: (annotation: ClipAnnotation) => void;
  onRemoveTagFromSoundEventAnnotation?: (
    annotation: SoundEventAnnotation,
  ) => void;
  onError?: (error: AxiosError) => void;
  enabled?: boolean;
}) {
  const { query, useMutation, useDestruction, setData, client } =
    useObject<ClipAnnotation>({
      name: "clip_annotation",
      uuid,
      initial: clipAnnotation,
      enabled,
      getFn: api.clipAnnotations.get,
      onError,
    });

  const delete_ = useDestruction({
    mutationFn: api.clipAnnotations.delete,
    onSuccess: onDelete,
  });

  const addTag = useMutation({
    mutationFn: api.clipAnnotations.addTag,
    onSuccess: onAddTag,
  });

  const removeTag = useMutation({
    mutationFn: api.clipAnnotations.removeTag,
    onSuccess: onRemoveTag,
  });

  const addNote = useMutation({
    mutationFn: api.clipAnnotations.addNote,
    onSuccess: onAddNote,
  });

  const removeNote = useMutation({
    mutationFn: api.clipAnnotations.removeNote,
    onSuccess: onRemoveNote,
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
      if (query.data == null) throw new Error("No clip annotation to add to.");
      return api.soundEventAnnotations.create(query.data, {
        geometry,
        tags,
      });
    },
    onSuccess: (data) => {
      setData((prev) => {
        if (prev == null) throw new Error("No clip annotation to add to.");
        return {
          ...prev,
          sound_events: [...(prev.sound_events || []), data],
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
      client.setQueryData(["sound_event_annotation", data.uuid], data);
      setData((prev) => {
        if (prev == null) throw new Error("No clip annotation to add to.");
        return {
          ...prev,
          sound_events: (prev.sound_events || []).map((soundEvent) =>
            soundEvent.uuid === data.uuid ? data : soundEvent,
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
        if (prev == null) throw new Error("No clip annotation to add to.");
        return {
          ...prev,
          sound_events: (prev.sound_events || []).filter(
            (soundEvent) => soundEvent.uuid !== data.uuid,
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
    { previousData: ClipAnnotation | undefined }
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
    onMutate: async ({ soundEventAnnotation, tag }) => {
      // Optimistic update - update UI immediately
      const previousData = query.data;
      
      setData((prev) => {
        if (prev == null) return prev;
        return {
          ...prev,
          sound_events: (prev.sound_events || []).map((soundEvent) =>
            soundEvent.uuid === soundEventAnnotation.uuid
              ? {
                  ...soundEvent,
                  tags: [...(soundEvent.tags || []), tag],
                }
              : soundEvent,
          ),
        };
      });
      
      return { previousData };
    },
    onSuccess: (data) => {
      setData((prev) => {
        if (prev == null) throw new Error("No clip annotation to add to.");
        return {
          ...prev,
          sound_events: (prev.sound_events || []).map((soundEvent) =>
            soundEvent.uuid === data.uuid ? data : soundEvent,
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
    { previousData: ClipAnnotation | undefined }
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
    onMutate: async ({ soundEventAnnotation, tag }) => {
      // Optimistic update - remove tag from UI immediately
      const previousData = query.data;
      
      setData((prev) => {
        if (prev == null) return prev;
        return {
          ...prev,
          sound_events: (prev.sound_events || []).map((soundEvent) =>
            soundEvent.uuid === soundEventAnnotation.uuid
              ? {
                  ...soundEvent,
                  tags: (soundEvent.tags || []).filter(
                    existingTag => !(existingTag.key === tag.key && existingTag.value === tag.value)
                  ),
                }
              : soundEvent,
          ),
        };
      });
      
      return { previousData };
    },
    onSuccess: (data) => {
      setData((prev) => {
        if (prev == null) throw new Error("No clip annotation to add to.");
        return {
          ...prev,
          sound_events: (prev.sound_events || []).map((soundEvent) =>
            soundEvent.uuid === data.uuid ? data : soundEvent,
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
    delete: delete_,
    addTag,
    removeTag,
    addNote,
    removeNote,
    addSoundEvent,
    updateSoundEvent,
    removeSoundEvent,
    addTagToSoundEvent,
    removeTagFromSoundEvent,
  } as const;
}
