"use client";
import { useContext } from "react";

import AnnotationProjectTasks from "@/components/annotation_projects/AnnotationProjectTasks";

import AnnotationProjectContext from "../context";

export default function Page() {
  const project = useContext(AnnotationProjectContext);

  return (
    <div className="w-full">
      <AnnotationProjectTasks 
        annotationProject={project}
      />
    </div>
  );
}
