import AnnotationProjectProgress from "./AnnotationProjectProgress";

import type { AnnotationProject } from "@/types";

export default function AnnotationProjectDetail({
  annotationProject,
}: {
  annotationProject: AnnotationProject;
}) {
  return (
    <div className="w-full space-y-4">
      <AnnotationProjectProgress annotationProject={annotationProject} />
    </div>
  );
}
