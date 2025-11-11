"use client";
import { useRouter } from "next/navigation";

import AnnotationProjectList from "@/components/annotation_projects/AnnotationProjectList";
import Hero from "@/components/Hero";

export default function AnnotationProjects() {
  const router = useRouter();

  return (
    <>
      <Hero text="Annotation Projects" />
      <AnnotationProjectList/>
    </>
  );
}
