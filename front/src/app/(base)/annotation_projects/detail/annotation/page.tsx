"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useContext, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { HOST } from "@/api/common";
import { AxiosError } from "axios";

import UserContext from "@/app/(base)/context";
import AnnotateTasks from "@/components/annotation_tasks/AnnotateTasks";
import Loading from "@/components/Loading";
import { CompleteIcon, NeedsReviewIcon, HelpIcon, VerifiedIcon } from "@/components/icons";
import useAnnotationTask from "@/hooks/api/useAnnotationTask";
import useAnnotateTasks from "@/hooks/annotation/useAnnotateTasks";
import useStore from "@/store";
import { changeURLParam } from "@/utils/url";

import AnnotationProjectContext from "../context";

import type { AnnotationTask, SpectrogramParameters, Tag, SoundEventAnnotation } from "@/types";

export default function Page() {
  const search = useSearchParams();
  // This is a bug in nextjs. usePathname() should already return the correct
  // path, but it does not. So we use this workaround...
  const pathname = HOST + usePathname();
  const router = useRouter();

  const project = useContext(AnnotationProjectContext);
  const user = useContext(UserContext);

  const annotationTaskID = search.get("annotation_task_id");

  // All hooks must be called before any conditional returns
  const handleError = useCallback((error: AxiosError) => {
    toast.error(error.message)
  }, []);

  const parameters = useStore((state) => state.spectrogramSettings);
  const setParameters = useStore((state) => state.setSpectrogramSettings);

  const onParameterSave = useCallback(
    (parameters: SpectrogramParameters) => {
      setParameters(parameters);
    },
    [setParameters],
  );

  const [selectedSoundEventAnnotation, setSelectedSoundEventAnnotation] = useState<SoundEventAnnotation | null>(null);
  const onDeselectSoundEventAnnotation = useCallback(() => {
    setSelectedSoundEventAnnotation(null);
  }, []);

  const onChangeTask = useCallback(
    (task: AnnotationTask) => {
      const url = changeURLParam({
        pathname,
        search,
        param: "annotation_task_id",
        value: task.id.toString(),
      });
      router.push(url);
    },
    [router, pathname, search],
  );

  const handleCompleteTask = useCallback(() => {
    toast(
      <div className="flex items-center gap-2">
        <CompleteIcon className="w-5 h-5 text-emerald-500" />
        <span>Accepted</span>
      </div>
    );
  }, []);

  const handleUnsureTask = useCallback(() => {
    toast(
      <div className="flex items-center gap-2">
        <HelpIcon className="w-5 h-5 text-amber-500" />
        <span>Unsure</span>
      </div>
    );
  }, []);

  const handleRejectTask = useCallback(() => {
    toast(
      <div className="flex items-center gap-2">
        <NeedsReviewIcon className="w-5 h-5 text-red-500" />
        <span>Rejected</span>
      </div>
    );
  }, []);

  const handleVerifyTask = useCallback(() => {
    toast(
      <div className="flex items-center gap-2">
        <VerifiedIcon className="w-5 h-5 text-blue-500" />
        <span>Verified</span>
      </div>
    );
  }, []);

  const filter = useMemo(
    () => ({
      annotation_project: project,
    }),
    [project],
  );

  // Use useAnnotateTasks as the primary source of truth for current task
  const tasks = useAnnotateTasks({
    filter,
    annotationTask: undefined, // Will be set from URL or first task
    onChangeTask,
    onCompleteTask: handleCompleteTask,
    onUnsureTask: handleUnsureTask,
    onRejectTask: handleRejectTask,
    onVerifyTask: handleVerifyTask,
    onDeselectSoundEventAnnotation,
  });

  // Use the current task from useAnnotateTasks to drive useAnnotationTask
  const currentTaskId = tasks.task?.id;

  const annotationTask = useAnnotationTask({
    id: currentTaskId || 0,
    enabled: !!currentTaskId,
    onError: handleError,
    annotationTask: tasks.task || undefined,
    include_recording: true,
    include_notes: true,
    include_sound_event_annotations: true,  // Full sound events needed here
    include_tags: true,
    include_features: true,
    include_note_users: true,  // For note author display
  });

  // Handle loading state
  if (tasks.isLoading) {
    return <Loading />;
  }

  if (tasks.isError) {
    return <div>Error loading annotation tasks</div>;
  }

  return (
    <div className="w-full">
      <AnnotateTasks
        taskFilter={filter}
        annotationTaskProps={annotationTask}
        tasks={tasks}
        parameters={parameters}
        currentUser={user}
        onParameterSave={onParameterSave}
      />
    </div>
  );
}
