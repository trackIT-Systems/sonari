import { useMutation as useQueryMutation, QueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";

import api from "@/app/api";
import type { AnnotationTask, Geometry, SoundEventAnnotation, Tag } from "@/types";

/**
 * Shared hook for sound event annotation mutations.
 * 
 * This hook provides common mutation operations for sound event annotations
 * that can be used by any parent object (AnnotationTask)
 * that contains a list of sound_event_annotations.
 * 
 * @param params Configuration object
 * @param params.getData Function that returns the current parent data
 * @param params.setData Function to update the parent data
 * @param params.client React Query client for cache updates
 * @param params.onError Optional error handler
 * @returns Object containing mutation functions for sound events
 */
export default function useSoundEventMutations({
  getData,
  setData,
  client,
  onError,
}: {
  getData: () => AnnotationTask | undefined;
  setData: (updater: (prev: AnnotationTask) => AnnotationTask) => void;
  client: QueryClient;
  onError?: (error: AxiosError) => void;
}) {
  const addSoundEventAnnotation = useQueryMutation<
    SoundEventAnnotation,
    AxiosError,
    {
      geometry: Geometry;
      tags: Tag[];
    }
  >({
    mutationFn: ({ geometry, tags }) => {
      const data = getData();
      if (data == null) {
        throw new Error("No annotation task to add the sound event to.");
      }
      return api.soundEventAnnotations.create(data, {
        geometry,
        tags,
      });
    },
    onSuccess: (data) => {
      setData((prev) => {
        if (prev == null) {
          throw new Error("No annotation task to add the sound event to on success.");
        }
        return {
          ...prev,
          sound_event_annotations: [...(prev.sound_event_annotations || []), data],
        };
      });
    },
    onError,
  });

  const updateSoundEventAnnotation = useQueryMutation<
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
      // Update the individual sound event annotation cache
      // Merge with existing cache to preserve relationships like features, created_by
      client.setQueryData(["sound_event_annotation", data.id], (oldData: SoundEventAnnotation | undefined) => {
        if (!oldData) return data;
        // Merge: keep old relationships that aren't in the new data
        return {
          ...oldData,
          ...data,
          // Preserve these if they exist in old data but not in new
          features: data.features ?? oldData.features,
          created_by: data.created_by ?? oldData.created_by,
        };
      });
      
      // Update the parent's list with merged annotation data so consumers don't see stale geometry
      setData((prev) => {
        if (prev == null) {
          throw new Error("No annotation task to update the sound event annotation in.");
        }
        return {
          ...prev,
          sound_event_annotations: (prev.sound_event_annotations || []).map((soundEventAnnotation) => {
            if (soundEventAnnotation.id !== data.id) {
              return soundEventAnnotation;
            }
            return {
              ...soundEventAnnotation,
              ...data,
              // Preserve relationships the backend might omit
              tags: data.tags ?? soundEventAnnotation.tags,
              features: data.features ?? soundEventAnnotation.features,
              created_by: data.created_by ?? soundEventAnnotation.created_by,
            };
          }),
        };
      });
    },
    onError,
  });

  const removeSoundEventAnnotation = useQueryMutation<
    SoundEventAnnotation,
    AxiosError,
    SoundEventAnnotation
  >({
    mutationFn: (soundEventAnnotation) => {
      return api.soundEventAnnotations.delete(soundEventAnnotation);
    },
    onSuccess: (data) => {
      setData((prev) => {
        if (prev == null) {
          throw new Error("No annotation task to remove the sound event annotation from.");
        }
        return {
          ...prev,
          sound_event_annotations: (prev.sound_event_annotations || []).filter(
            (soundEventAnnotation) => soundEventAnnotation.id !== data.id
          ),
        };
      });
    },
    onError,
  });

  const addTagToSoundEventAnnotation = useQueryMutation<
    SoundEventAnnotation,
    AxiosError,
    {
      soundEventAnnotation: SoundEventAnnotation;
      tag: Tag;
    }
  >({
    mutationFn: ({ soundEventAnnotation, tag }) => {
      // Check if tag already exists before making API call
      const hasTag = soundEventAnnotation.tags?.some(
        (existingTag) => existingTag.key === tag.key && existingTag.value === tag.value
      );

      if (hasTag) {
        throw new Error("Tag already exists");
      }

      return api.soundEventAnnotations.addTag(soundEventAnnotation, tag);
    },
    onSuccess: (data) => {
      // Update the individual sound event annotation cache
      // Merge with existing cache to preserve relationships like features, created_by
      client.setQueryData(["sound_event_annotation", data.id], (oldData: SoundEventAnnotation | undefined) => {
        if (!oldData) return data;
        // Merge: keep old relationships that aren't in the new data
        return {
          ...oldData,
          ...data,
          // Preserve these if they exist in old data but not in new
          features: data.features ?? oldData.features,
          created_by: data.created_by ?? oldData.created_by,
        };
      });
      
      setData((prev) => {
        if (prev == null) {
          throw new Error("No annotation task to add sound event tag to.");
        }
        return {
          ...prev,
          sound_event_annotations: (prev.sound_event_annotations || []).map(
            (soundEventAnnotation) =>
              soundEventAnnotation.id === data.id ? data : soundEventAnnotation
          ),
        };
      });
    },
    onError: (error) => {
      // Don't call onError for duplicate tag errors (client-side check)
      if (error.message !== "Tag already exists") {
        onError?.(error);
      }
    },
  });

  const removeTagFromSoundEventAnnotation = useQueryMutation<
    SoundEventAnnotation,
    AxiosError,
    {
      soundEventAnnotation: SoundEventAnnotation;
      tag: Tag;
    }
  >({
    mutationFn: ({ soundEventAnnotation, tag }) => {
      // Check if tag exists before making API call
      const hasTag = soundEventAnnotation.tags?.some(
        (existingTag) => existingTag.key === tag.key && existingTag.value === tag.value
      );

      if (!hasTag) {
        throw new Error("Tag does not exist");
      }

      return api.soundEventAnnotations.removeTag(soundEventAnnotation, tag);
    },
    onSuccess: (data) => {
      // Update the individual sound event annotation cache
      // Merge with existing cache to preserve relationships like features, created_by
      client.setQueryData(["sound_event_annotation", data.id], (oldData: SoundEventAnnotation | undefined) => {
        if (!oldData) return data;
        // Merge: keep old relationships that aren't in the new data
        return {
          ...oldData,
          ...data,
          // Preserve these if they exist in old data but not in new
          features: data.features ?? oldData.features,
          created_by: data.created_by ?? oldData.created_by,
        };
      });
      
      setData((prev) => {
        if (prev == null) {
          throw new Error("No annotation task to remove sound event tag from.");
        }
        return {
          ...prev,
          sound_event_annotations: (prev.sound_event_annotations || []).map(
            (soundEventAnnotation) =>
              soundEventAnnotation.id === data.id ? data : soundEventAnnotation
          ),
        };
      });
    },
    onError: (error) => {
      // Don't call onError for non-existent tag errors (client-side check)
      if (error.message !== "Tag does not exist") {
        onError?.(error);
      }
    },
  });

  return {
    addSoundEventAnnotation,
    updateSoundEventAnnotation,
    removeSoundEventAnnotation,
    addTagToSoundEventAnnotation,
    removeTagFromSoundEventAnnotation,
  } as const;
}

