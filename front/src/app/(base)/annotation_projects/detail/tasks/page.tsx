"use client";
import { useContext } from "react";

import AnnotationProjectTasks from "@/components/annotation_projects/AnnotationProjectTasks";
import Center from "@/components/layouts/Center";

import AnnotationProjectContext from "../context";

export default function Page() {
  const project = useContext(AnnotationProjectContext);

  return (
    <Center>
      <AnnotationProjectTasks annotationProject={project}/>
    </Center>
  );
}
