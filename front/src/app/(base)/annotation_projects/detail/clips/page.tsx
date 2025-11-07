"use client";
import { notFound } from "next/navigation";
import { useContext } from "react";

import AnnotationProject from "../context";

import type { AnnotationTask } from "@/types";

import "./page.css";
import AnnotationProjectTasks from "@/components/annotation_projects/AnnotationProjectTasks";

function getAnnotationTaskLink(annotationTask: AnnotationTask): string {
  return `detail/annotation/?annotation_task_id=${annotationTask.id}`;
}

export default function Page() {
  const annotationProject = useContext(AnnotationProject);

  if (annotationProject == null) {
    return notFound();
  }

  return (
    <div className="w-full">
      <AnnotationProjectTasks
        annotationProject={annotationProject}
        getAnnotationTaskLink={getAnnotationTaskLink}
      />
    </div>
  );
}
