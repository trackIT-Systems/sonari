import AnnotationProjectProgress from "./AnnotationProjectProgress";
// import AnnotationProjectTagCounts from "./AnnotationProjectTagCounts";

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
    <div className="w-full space-y-4">
      <AnnotationProjectProgress annotationProject={annotationProject} />
      {/* <AnnotationProjectTagCounts annotationProject={annotationProject} /> */}
    </div>
  );
}
