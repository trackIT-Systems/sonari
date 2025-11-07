import { type AxiosError } from "axios";
import { useMemo } from "react";

import api from "@/app/api";
import useObject from "@/hooks/utils/useObject";

import type { Recording } from "@/types";

export default function useRecording({
  id,
  recording,
  enabled = true,
  onUpdate,
  onDelete,
  onAddTag,
  onRemoveTag,
  onAddFeature,
  onRemoveFeature,
  onUpdateFeature,
  onError,
}: {
  id: number;
  recording?: Recording;
  enabled?: boolean;
  onUpdate?: (recording: Recording) => void;
  onDelete?: (recording: Recording) => void;
  onAddTag?: (recording: Recording) => void;
  onRemoveTag?: (recording: Recording) => void;
  onAddFeature?: (recording: Recording) => void;
  onRemoveFeature?: (recording: Recording) => void;
  onUpdateFeature?: (recording: Recording) => void;
  onError?: (error: AxiosError) => void;
}) {
  if (recording !== undefined && recording.id !== id) {
    throw new Error("Recording id does not match");
  }

  const {
    query,
    useMutation,
    setData: set,
  } = useObject<Recording>({
    id,
    initial: recording,
    name: "dataset",
    enabled,
    getFn: api.recordings.get,
    onError,
  });

  const update = useMutation({
    mutationFn: api.recordings.update,
    onSuccess: onUpdate,
  });

  const addTag = useMutation({
    mutationFn: api.recordings.addTag,
    onSuccess: onAddTag,
  });

  const removeTag = useMutation({
    mutationFn: api.recordings.removeTag,
    onSuccess: onRemoveTag,
  });

  const addFeature = useMutation({
    mutationFn: api.recordings.addFeature,
    onSuccess: onAddFeature,
  });

  const removeFeature = useMutation({
    mutationFn: api.recordings.removeFeature,
    onSuccess: onRemoveFeature,
  });

  const updateFeature = useMutation({
    mutationFn: api.recordings.updateFeature,
    onSuccess: onUpdateFeature,
  });

  const deleteRecording = useMutation({
    mutationFn: api.recordings.delete,
    onSuccess: onDelete,
  });

  const downloadURL = useMemo(() => {
    if (query.data == null) return null;
    return api.audio.getDownloadUrl({ recording: query.data });
  }, [query.data]);

  return {
    ...query,
    update,
    addTag,
    removeTag,
    addFeature,
    removeFeature,
    updateFeature,
    delete: deleteRecording,
    set,
    downloadURL,
  } as const;
}
