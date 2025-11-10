import { type AxiosError } from "axios";
import api from "@/app/api";
import useObject from "@/hooks/utils/useObject";

import type { AnnotationProject } from "@/types";

export default function useAnnotationProject({
  id,
  annotationProject,
  onError,
  enabled = true,
}: {
  id: number;
  annotationProject?: AnnotationProject;
  onError?: (error: AxiosError) => void;
  enabled?: boolean;
}) {
  const { query } = useObject<AnnotationProject>({
    id,
    initial: annotationProject,
    name: "annotation_project",
    enabled,
    getFn: api.annotationProjects.get,
    onError,
  });

  return {
    ...query,
  } as const;
}
