"use client";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import toast from "react-hot-toast";

import AnnotationProjectList from "@/components/annotation_projects/AnnotationProjectList";
import Hero from "@/components/Hero";

import type { AnnotationProject } from "@/types";

export default function AnnotationProjects() {
  const router = useRouter();

  return (
    <>
      <Hero text="Annotation Projects" />
      <AnnotationProjectList/>
    </>
  );
}
