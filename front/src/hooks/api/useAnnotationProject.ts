import { useMutation as useQueryMutation } from "@tanstack/react-query";
import { type AxiosError } from "axios";
import { useCallback, useMemo } from "react";
import api from "@/app/api";
import useObject from "@/hooks/utils/useObject";

import type { AnnotationProject, AnnotationTask } from "@/types";

export default function useAnnotationProject({
  id,
  annotationProject,
  onUpdate,
  onDelete,
  onAddTag,
  onRemoveTag,
  onError,
  enabled = true,
}: {
  id: number;
  annotationProject?: AnnotationProject;
  onUpdate?: (annotationProject: AnnotationProject) => void;
  onDelete?: (annotationProject: AnnotationProject) => void;
  onAddTag?: (annotationProject: AnnotationProject) => void;
  onRemoveTag?: (annotationProject: AnnotationProject) => void;
  onAddAnnotationTasks?: (tasks: AnnotationTask[]) => void;
  onError?: (error: AxiosError) => void;
  enabled?: boolean;
}) {
  const { query, useMutation, client } = useObject<AnnotationProject>({
    id,
    initial: annotationProject,
    name: "annotation_project",
    enabled,
    getFn: api.annotationProjects.get,
    onError,
  });

  const update = useMutation({
    mutationFn: api.annotationProjects.update,
    onSuccess: onUpdate,
  });

  const addTag = useMutation({
    mutationFn: api.annotationProjects.addTag,
    onSuccess: onAddTag,
  });

  const removeTag = useMutation({
    mutationFn: api.annotationProjects.removeTag,
    onSuccess: onRemoveTag,
  });

  const delete_ = useMutation({
    mutationFn: api.annotationProjects.delete,
    onSuccess: onDelete,
  });

  return {
    ...query,
    update,
    addTag,
    removeTag,
    delete: delete_,
  } as const;
}
