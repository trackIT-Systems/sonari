"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useContext, useMemo } from "react";
import toast from "react-hot-toast";
import { HOST } from "@/api/common";
import { AxiosError } from "axios";

import UserContext from "@/app/(base)/context";
import AnnotateTasks from "@/components/annotation_tasks/AnnotateTasks";
import Loading from "@/components/Loading";
import { CompleteIcon, NeedsReviewIcon, HelpIcon, VerifiedIcon } from "@/components/icons";
import useAnnotationTask from "@/hooks/api/useAnnotationTask";
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

  const annotationTask = useAnnotationTask({
    id: annotationTaskID ? parseInt(annotationTaskID) : 0,
    enabled: !!annotationTaskID,
    onError: handleError,
    include_recording: true,
    include_notes: true,
    include_sound_event_annotations: true,  // Full sound events needed here
    include_tags: true,
    include_features: true,
    include_note_users: true,  // For note author display
  });

  const parameters = useStore((state) => state.spectrogramSettings);
  const setParameters = useStore((state) => state.setSpectrogramSettings);

  const onParameterSave = useCallback(
    (parameters: SpectrogramParameters) => {
      setParameters(parameters);
    },
    [setParameters],
  );

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

  // Now handle conditional cases after all hooks have been called
  if (annotationTaskID == null) {
    toast.error("Annotation task not found.");
    router.back()
    return null;
  }

  if (annotationTask.isLoading && !annotationTask.data) {
    return <Loading />;
  }

  return (
    <div className="w-full">
      <AnnotateTasks
        taskFilter={filter}
        annotationTaskProps={annotationTask}
        parameters={parameters}
        onChangeTask={onChangeTask}
        currentUser={user}
        onParameterSave={onParameterSave}
        onCompleteTask={handleCompleteTask}
        onUnsureTask={handleUnsureTask}
        onRejectTask={handleRejectTask}
        onVerifyTask={handleVerifyTask}
      />
    </div>
  );
}
