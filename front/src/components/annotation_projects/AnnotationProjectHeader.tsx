import {
  useRouter,
  useSearchParams,
  useSelectedLayoutSegment,
} from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useCallback } from "react";
import toast from "react-hot-toast";

import Header from "@/components/Header";
import { H1 } from "@/components/Headings";
import { DatasetIcon, EditIcon, TasksIcon } from "@/components/icons";
import Tabs from "@/components/Tabs";
import api from "@/app/api";
import { type AnnotationTaskFilter, type AnnotationTaskIndexPage } from "@/api/annotation_tasks";
import { annotationTaskIndexQueryKey } from "@/hooks/api/useAnnotationTaskIndex";
import {
  annotationTaskFilterPersistKey,
  clearAnnotationTaskFilterPersist,
} from "@/hooks/utils/annotationTaskFilterPersistKey";
import { blurActiveElement } from "@/utils/focus";

import type { AnnotationProject } from "@/types";

/** The task filter the Tasks tab saved for the project, which the annotate view opens with */
function readPersistedTaskFilter(annotationProject: AnnotationProject): AnnotationTaskFilter {
  const fallback: AnnotationTaskFilter = { annotation_project: annotationProject };
  const key = annotationTaskFilterPersistKey(annotationProject.id);
  if (!key || typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...(JSON.parse(raw) as AnnotationTaskFilter), annotation_project: annotationProject };
  } catch {
    return fallback;
  }
}

export default function AnnotationProjectHeader({
  annotationProject,
}: {
  annotationProject: AnnotationProject;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
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
        // Open the first task of the filter the annotate view will use (the
        // Tasks tab's, cleared above when coming from the overview), so the
        // view opens on it instead of asking to apply the filter. The table
        // usually holds that filter's full index already: no request then.
        const filter = readPersistedTaskFilter(annotationProject);
        const cached = queryClient.getQueryData<AnnotationTaskIndexPage>(
          annotationTaskIndexQueryKey(filter),
        );
        const first =
          cached?.items[0]
          ?? (await api.annotationTasks.getIndex({ ...filter, limit: 1, offset: 0 })).items[0];

        if (first == null) {
          toast.error(
            enteringFromOverview
              ? "No annotation tasks found in this project."
              : "No annotation tasks match the filter.",
          );
          return;
        }
        taskId = first.id;
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
  }, [annotationProject, enteringFromOverview, params, queryClient, router]);

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
