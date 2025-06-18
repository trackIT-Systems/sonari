import AnnotationProjectProgress from "./AnnotationProjectProgress";

import type { AnnotationProject } from "@/types";

export default function AnnotationProjectDetail({
  annotationProject,
  onChange,
  onDelete,
}: {
  annotationProject: AnnotationProject;
  onChange?: (data: AnnotationProject) => void;
  onDelete?: (data: Promise<AnnotationProject>) => void;
}) {
  return (
    <div className="w-full">
      <AnnotationProjectProgress annotationProject={annotationProject} />
    </div>
  );
}
