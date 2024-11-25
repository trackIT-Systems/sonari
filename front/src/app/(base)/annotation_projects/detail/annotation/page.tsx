"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useContext, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { HOST } from "@/api/common";

import UserContext from "@/app/(base)/context";
import AnnotateTasks from "@/components/annotation/AnnotateTasks";
import Loading from "@/components/Loading";
import useAnnotationTask from "@/hooks/api/useAnnotationTask";
import useStore from "@/store";
import { changeURLParam } from "@/utils/url";

import AnnotationProjectContext from "../context";

import api from "@/app/api";
import type { AnnotationTask, SpectrogramParameters, Tag, SoundEventAnnotation } from "@/types";

export default function Page() {
  const search = useSearchParams();
  // This is a bug in nextjs. usePathname() should already return the correct
  // path, but it does not. So we use this workaround...
  const pathname = HOST + usePathname();
  const router = useRouter();

  const project = useContext(AnnotationProjectContext);
  const user = useContext(UserContext);

  const annotationTaskUUID = search.get("annotation_task_uuid");

  const annotationTask = useAnnotationTask({
    uuid: annotationTaskUUID || "",
    enabled: !!annotationTaskUUID,
  });

  const parameters = useStore((state) => state.spectrogramSettings);
  const setParameters = useStore((state) => state.setSpectrogramSettings);

  const onParameterSave = useCallback(
    (parameters: SpectrogramParameters) => {
      toast.success("Spectrogram settings saved.");
      setParameters(parameters);
    },
    [setParameters],
  );

  const { mutate: handleTagCreate } = useMutation({
    mutationFn: async (tag: Tag) => {
      return await api.annotationProjects.addTag(project, tag);
    },
  });

  const { mutateAsync: handleAddSoundEventTag } = useMutation({
    mutationFn: async ({ annotation, tag }: { annotation: SoundEventAnnotation, tag: Tag }) => {
      return await api.soundEventAnnotations.addTag(annotation, tag);
    },
  });

  const { mutateAsync: handleRemoveSoundEventTag } = useMutation({
    mutationFn: async ({ annotation, tag }: { annotation: SoundEventAnnotation, tag: Tag }) => {
      return await api.soundEventAnnotations.removeTag(annotation, tag);
    },
  });

  const onChangeTask = useCallback(
    (task: AnnotationTask) => {
      const url = changeURLParam({
        pathname,
        search,
        param: "annotation_task_uuid",
        value: task.uuid,
      });
      router.push(url);
    },
    [router, pathname, search],
  );

  const handleCompleteTask = useCallback(() => {
    toast.success("Accepted");
  }, []);

  const handleUnsureTask = useCallback(() => {
    toast.success("Marked as unsure");
  }, []);

  const handleRejectTask = useCallback(() => {
    toast.success("Rejeced");
  }, []);

  const handleVerifyTask = useCallback(() => {
    toast.success("Verified");
  }, []);

  const filter = useMemo(
    () => ({
      annotation_project: project,
    }),
    [project],
  );

  if (annotationTask.isLoading && !annotationTask.data) {
    return <Loading />;
  }

  return (
    <div className="w-full">
    <AnnotateTasks
      instructions={project.annotation_instructions || ""}
      taskFilter={filter}
      tagFilter={filter}
      projectTags={project.tags == null ? [] : project.tags}
      annotationTask={annotationTask.data}
      parameters={parameters}
      onChangeTask={onChangeTask}
      currentUser={user}
      onParameterSave={onParameterSave}
      onCompleteTask={handleCompleteTask}
      onUnsureTask={handleUnsureTask}
      onRejectTask={handleRejectTask}
      onVerifyTask={handleVerifyTask}
      onCreateTag={handleTagCreate}
    />
    </div>
  );
}
