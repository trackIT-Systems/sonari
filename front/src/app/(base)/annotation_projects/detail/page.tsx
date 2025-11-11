"use client";
import { useRouter } from "next/navigation";
import { useContext } from "react";

import AnnotationProjectDetail from "@/components/annotation_projects/AnnotationProjectDetail";

import AnnotationProjectContext from "./context";

export default function Page() {
  const annotationProject = useContext(AnnotationProjectContext);
  const router = useRouter();

  return (
    <AnnotationProjectDetail
      annotationProject={annotationProject}
    />
  );
}
