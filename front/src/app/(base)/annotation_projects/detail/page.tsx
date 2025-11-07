"use client";
import { useRouter } from "next/navigation";
import { useCallback, useContext } from "react";
import toast from "react-hot-toast";

import AnnotationProjectDetail from "@/components/annotation_projects/AnnotationProjectDetail";

import AnnotationProjectContext from "./context";

import type { AnnotationProject } from "@/types";

export default function Page() {
  const annotationProject = useContext(AnnotationProjectContext);
  const router = useRouter();

  return (
    <AnnotationProjectDetail
      annotationProject={annotationProject}
    />
  );
}
