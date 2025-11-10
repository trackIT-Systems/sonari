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
      include_recording: true,
      include_tags: true,
      include_notes: true,
      include_sound_event_annotations: true 
    }
  ), [annotationProject]);

  return (
    <AnnotationTaskTable
      filter={filter}
      fixed={["annotation_project"]}
    />
  );
}
