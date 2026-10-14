"use client";

import { useContext, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";

import AnnotationProjectContext from "@/app/(base)/annotation_projects/detail/context";
import GuidedTourCoach, {
  guidedTourStorageKey,
  isLessonDone,
} from "@/components/workshop/guidedTour/GuidedTourCoach";
import {
  getAnnotateLesson,
  getTasksTabLesson,
  getVariantManifest,
} from "@/components/workshop/guidedTour/manifest";
import type { GuidedTourVariant } from "@/components/workshop/guidedTour/types";
import useAnnotationTaskIndex from "@/hooks/api/useAnnotationTaskIndex";

import type { AnnotationTask } from "@/types";
import type { AnnotationTaskFilter } from "@/api/annotation_tasks";

const emptyTourFilter: AnnotationTaskFilter = {};

export default function WorkshopTutorial({
  annotationTask,
}: {
  annotationTask?: AnnotationTask | null;
}) {
  const project = useContext(AnnotationProjectContext);
  const pathname = usePathname();
  const router = useRouter();

  const variant = project?.guided_tour_variant as GuidedTourVariant | null | undefined;
  const hasManifest = variant != null && getVariantManifest(variant) != null;

  const onTasksTab = pathname?.includes("/detail/tasks");
  const onAnnotateTab = pathname?.includes("/detail/annotation");

  const projectId = project?.id;
  const tourTaskFilter = useMemo((): AnnotationTaskFilter => {
    if (!project || projectId == null) {
      return emptyTourFilter;
    }
    return { annotation_project: project };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one stable filter object per project id
  }, [projectId]);

  const taskIndexQuery = useAnnotationTaskIndex({
    filter: tourTaskFilter,
    enabled: Boolean(project?.is_guided_tour && onAnnotateTab && annotationTask),
    pageSize: -1,
  });

  const lessonIndex = useMemo(() => {
    if (!annotationTask?.id) return -1;
    return taskIndexQuery.items.findIndex((t) => t.id === annotationTask.id);
  }, [annotationTask?.id, taskIndexQuery.items]);

  const lesson = useMemo(() => {
    if (!variant || !hasManifest) return null;
    if (onTasksTab) {
      return getTasksTabLesson(variant);
    }
    if (onAnnotateTab && lessonIndex >= 0) {
      return getAnnotateLesson(variant, lessonIndex);
    }
    return null;
  }, [variant, hasManifest, onTasksTab, onAnnotateTab, lessonIndex]);

  if (!project?.is_guided_tour || !hasManifest || lesson == null) {
    return null;
  }
  if (onAnnotateTab && taskIndexQuery.isLoading) {
    return null;
  }

  const lessonCount = variant ? (getVariantManifest(variant)?.lessons.length ?? 0) : 0;
  const storageKey = guidedTourStorageKey(project.id, lesson.id);

  const getUnfinishedLessons = () => {
    const manifest = variant ? getVariantManifest(variant) : null;
    if (!manifest) return [];
    const missing: string[] = [];
    if (!isLessonDone(project.id, manifest.tasksTab.id)) {
      missing.push(`Tasks table (open the Tasks tab)`);
    }
    manifest.lessons.forEach((l, i) => {
      if (!isLessonDone(project.id, l.id)) missing.push(`Lesson ${i + 1}: ${l.title}`);
    });
    return missing;
  };

  return (
    <GuidedTourCoach
      key={storageKey}
      lesson={lesson}
      projectId={project.id}
      storageKey={storageKey}
      lessonNumber={onAnnotateTab ? lessonIndex + 1 : undefined}
      lessonCount={onAnnotateTab ? lessonCount : undefined}
      getUnfinishedLessons={getUnfinishedLessons}
      onFinish={onAnnotateTab && lessonIndex === lessonCount - 1 ? () => router.push("/") : undefined}
    />
  );
}
