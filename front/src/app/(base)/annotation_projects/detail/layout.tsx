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

  // All hooks must be called before any conditional returns
  const project = useAnnotationProject({
    id: id ? parseInt(id) : 0,
    enabled: id != null,
  });

  // Handle conditional cases after all hooks have been called
  if (id == null) {
    toast.error("Annotation project not specified.");
    router.push("/annotation_projects/");
    return null;
  }

  if (project.isLoading) {
    return <Loading />;
  }

  if (project.isError || project.data == null) {
    toast.error(`Annotation project not found. ${project.isError}`);
    router.push("/annotation_projects/");
    return null;
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
