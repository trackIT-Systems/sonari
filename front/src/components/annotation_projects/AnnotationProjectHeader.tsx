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
import { clearAnnotationTaskFilterPersist } from "@/hooks/utils/annotationTaskFilterPersistKey";
import { blurActiveElement } from "@/utils/focus";

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

  const enteringFromOverview = selectedLayoutSegment === null;

  const handleAnnotateClick = useCallback(async () => {
    // Always fetch the first task, don't remember the previous one
    if (enteringFromOverview) {
      clearAnnotationTaskFilterPersist(annotationProject.id);
    }
    setIsLoadingFirstTask(true);
    try {
      const projectId = params.get("annotation_project_id");
      // A guided tour continues where the user is (the first lesson without a
      // badge), not at lesson 1: e.g. back from a lesson on the Tasks tab.
      let taskId: number | null = null;
      if (annotationProject.is_guided_tour) {
        const { tours } = await api.annotationProjects.getGuidedTourAvailable();
        taskId =
          tours.find((tour) => tour.annotation_project_id === annotationProject.id)
            ?.resume_annotation_task_id ?? null;
      }
      if (taskId == null) {
        const response = await api.annotationTasks.getMany({
          annotation_project: annotationProject,
          limit: 1,
          offset: 0,
        });

        if (response.items.length === 0) {
          toast.error("No annotation tasks found in this project.");
          return;
        }
        taskId = response.items[0].id;
      }

      blurActiveElement();
      router.push(
        `/annotation_projects/detail/annotation/?annotation_project_id=${projectId}&annotation_task_id=${taskId}`,
      );
    } catch (error) {
      toast.error("Failed to load annotation tasks.");
      console.error(error);
    } finally {
      setIsLoadingFirstTask(false);
    }
  }, [annotationProject, enteringFromOverview, params, router]);

  return (
    <Header>
      <div className="flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
        <H1 className="min-w-0 break-words text-balance sm:max-w-[min(100%,60rem)] sm:shrink">
          {annotationProject.name}
        </H1>
        <div className="shrink-0" data-guided-tour="header-tabs">
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
                if (enteringFromOverview) {
                  clearAnnotationTaskFilterPersist(annotationProject.id);
                }
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
      </div>
    </Header>
  );
}
