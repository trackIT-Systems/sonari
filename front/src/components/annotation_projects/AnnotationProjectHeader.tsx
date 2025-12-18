import {
  useRouter,
  useSearchParams,
  useSelectedLayoutSegment,
} from "next/navigation";
import { useState, useCallback } from "react";
import toast from "react-hot-toast";

import Header from "@/components/Header";
import { H1 } from "@/components/Headings";
import { DatasetIcon, EditIcon, TasksIcon } from "@/components/icons";
import Tabs from "@/components/Tabs";
import api from "@/app/api";

import type { AnnotationProject } from "@/types";

export default function AnnotationProjectHeader({
  annotationProject,
}: {
  annotationProject: AnnotationProject;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const selectedLayoutSegment = useSelectedLayoutSegment();
  const [isLoadingFirstTask, setIsLoadingFirstTask] = useState(false);

  const handleAnnotateClick = useCallback(async () => {
    // Always fetch the first task, don't remember the previous one
    setIsLoadingFirstTask(true);
    try {
      const response = await api.annotationTasks.getMany({
        annotation_project: annotationProject,
        limit: 1,
        offset: 0,
      });

      if (response.items.length === 0) {
        toast.error("No annotation tasks found in this project.");
        return;
      }

      const firstTask = response.items[0];
      const projectId = params.get("annotation_project_id");
      router.push(
        `/annotation_projects/detail/annotation/?annotation_project_id=${projectId}&annotation_task_id=${firstTask.id}`,
      );
    } catch (error) {
      toast.error("Failed to load annotation tasks.");
      console.error(error);
    } finally {
      setIsLoadingFirstTask(false);
    }
  }, [annotationProject, params, router]);

  return (
    <Header>
      <div className="flex overflow-x-auto flex-row space-x-4 w-full">
        <H1 className="overflow-auto max-w-xl whitespace-nowrap">
          {annotationProject.name}
        </H1>
        <Tabs
          tabs={[
            {
              id: "overview",
              title: "Overview",
              isActive: selectedLayoutSegment === null,
              icon: <DatasetIcon className="w-5 h-5 align-middle" />,
              onClick: () => {
                router.push(
                  `/annotation_projects/detail/?${params?.toString() || ''}`,
                );
              },
            },
            {
              id: "tasks",
              title: "Tasks",
              isActive: selectedLayoutSegment === "tasks",
              icon: <TasksIcon className="w-5 h-5 align-middle"/>,
              onClick: () => {
                router.push(
                  `/annotation_projects/detail/tasks/?${params.toString()}`,
                );
              },
            },
            {
              id: "annotate",
              title: isLoadingFirstTask ? "Loading..." : "Annotate",
              isActive: selectedLayoutSegment === "annotation",
              icon: <EditIcon className="w-5 h-5 align-middle" />,
              onClick: isLoadingFirstTask ? undefined : handleAnnotateClick,
            },
          ]}
        />
      </div>
    </Header>
  );
}
