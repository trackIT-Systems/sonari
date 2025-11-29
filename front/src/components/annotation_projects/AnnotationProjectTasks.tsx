import { useMemo } from "react";

import AnnotationTaskTable from "@/components/annotation_tasks/AnnotationTaskTable";

import type {AnnotationProject, AnnotationTask} from "@/types";

export default function AnnotationProjectTasks({
  annotationProject,
}: {
  annotationProject: AnnotationProject;
}) {

  const filter = useMemo(() => (
    {
      annotation_project: annotationProject,
    }
  ), [annotationProject]);

  return (
    <AnnotationTaskTable
      filter={filter}
      fixed={["annotation_project"]}
    />
  );
}
