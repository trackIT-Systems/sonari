import AnnotationProjectProgress from "./AnnotationProjectProgress";
import AnnotationProjectSpeciesChart from "./AnnotationProjectSpeciesChart";
import AnnotationProjectTagScope from "./AnnotationProjectTagScope";

import type { AnnotationProject } from "@/types";

export default function AnnotationProjectDetail({
  annotationProject,
}: {
  annotationProject: AnnotationProject;
}) {
  return (
    <div className="w-full space-y-4">
      <AnnotationProjectProgress annotationProject={annotationProject} />
      <AnnotationProjectSpeciesChart annotationProject={annotationProject} />
      <AnnotationProjectTagScope annotationProject={annotationProject} />
    </div>
  );
}
