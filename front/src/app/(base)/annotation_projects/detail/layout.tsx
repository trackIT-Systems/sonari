"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { type ReactNode } from "react";
import { toast } from "react-hot-toast";

import Loading from "@/app/loading";
import ProjectHeader from "@/components/annotation_projects/AnnotationProjectHeader";
import useAnnotationProject from "@/hooks/api/useAnnotationProject";

import AnnotationProjectContext from "./context";

export default function Layout({ children }: { children: ReactNode }) {
  const params = useSearchParams();
  const router = useRouter();

  const id = params.get("annotation_project_id");

  if (id == null) {
    toast.error("Annotation project not specified.");
    router.push("/annotation_projects/");
    return;
  }

  // Fetch the annotation project.
  const project = useAnnotationProject({
    id: parseInt(id) as number,
  });

  if (project.isLoading) {
    return <Loading />;
  }

  if (project.isError || project.data == null) {
    toast.error("Annotation project not found.");
    router.push("/annotation_projects/");
    return;
  }

  return (
    <AnnotationProjectContext.Provider value={project.data}>
      <div className="flex flex-col h-screen">
        <div className="flex-none">
          <ProjectHeader annotationProject={project.data} />
        </div>
        <div className="flex-1 p-4 min-h-0 overflow-auto">
          {children}
        </div>
      </div>
    </AnnotationProjectContext.Provider>
  );
}
