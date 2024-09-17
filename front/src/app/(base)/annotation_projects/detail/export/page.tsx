"use client";
import { notFound, useRouter } from "next/navigation";
import { useCallback, useContext } from "react";
import toast from "react-hot-toast";

import Center from "@/components/layouts/Center";

import AnnotationProjectContext from "../context";
import AnnotationProjectExport from "@/components/annotation_projects/AnnotationProjectExport";

export default function Page() {
  const project = useContext(AnnotationProjectContext);

  if (project == null) return notFound();

  return (
    <Center>
      <AnnotationProjectExport projectTags={project.tags == null ? [] : project.tags} project={project} />
    </Center>
  );
}
