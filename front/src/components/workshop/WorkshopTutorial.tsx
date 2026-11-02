"use client";

import { useContext, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import toast from "react-hot-toast";

import AnnotationProjectContext from "@/app/(base)/annotation_projects/detail/context";
import GuidedTourCoach, {
  guidedTourStorageKey,
  isLessonDone,
} from "@/components/workshop/guidedTour/GuidedTourCoach";
import {
  getAnnotateLesson,
  getTasksTabLessons,
  getVariantManifest,
  pickTasksTabLesson,
} from "@/components/workshop/guidedTour/manifest";
import type { GuidedTourLesson, GuidedTourVariant } from "@/components/workshop/guidedTour/types";
import useAnnotationTaskIndex from "@/hooks/api/useAnnotationTaskIndex";

import type { AnnotationTask } from "@/types";
import type { AnnotationTaskFilter } from "@/api/annotation_tasks";

const emptyTourFilter: AnnotationTaskFilter = {};

/**
 * Shown on tasks after the last lesson: the bulk-lesson material ("tour: bulk"
 * task tag), which the tour works on from the Tasks tab, not one by one.
 */
const BULK_MATERIAL_LESSON: GuidedTourLesson = {
  id: "bulk-material",
  title: "Bulk exercise",
  steps: [
    {
      target: "header-tabs",
      title: "Material for the bulk lesson",
      hint: "This recording is one of many for the bulk lesson. They are handled all at once on the Tasks tab, not one by one here. Click “Tasks” at the top to work on them there.",
    },
  ],
};

export default function WorkshopTutorial({
  annotationTask,
  onFinishTour,
}: {
  annotationTask?: AnnotationTask | null;
  /** Runs before leaving the tour from its last lesson. */
  onFinishTour?: () => Promise<void>;
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
    if (!variant || !hasManifest || projectId == null) return null;
    if (onTasksTab) {
      return pickTasksTabLesson(getTasksTabLessons(variant), (id) => isLessonDone(projectId, id));
    }
    if (onAnnotateTab && lessonIndex >= 0) {
      return getAnnotateLesson(variant, lessonIndex) ?? BULK_MATERIAL_LESSON;
    }
    return null;
  }, [variant, hasManifest, projectId, onTasksTab, onAnnotateTab, lessonIndex]);

  if (!project?.is_guided_tour || !hasManifest || lesson == null) {
    return null;
  }
  if (onAnnotateTab && taskIndexQuery.isLoading) {
    return null;
  }

  const lessonCount = variant ? (getVariantManifest(variant)?.lessons.length ?? 0) : 0;
  const isLessonTask = onAnnotateTab && lessonIndex < lessonCount;
  const storageKey = guidedTourStorageKey(project.id, lesson.id);

  const getUnfinishedLessons = () => {
    const manifest = variant ? getVariantManifest(variant) : null;
    if (!manifest) return [];
    const missing: string[] = [];
    for (const tasksLesson of getTasksTabLessons(variant!)) {
      if (!isLessonDone(project.id, tasksLesson.id)) {
        missing.push(`${tasksLesson.title} (open the Tasks tab)`);
      }
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
      lessonNumber={isLessonTask ? lessonIndex + 1 : undefined}
      lessonCount={isLessonTask ? lessonCount : undefined}
      getUnfinishedLessons={getUnfinishedLessons}
      onFinish={
        onAnnotateTab && lessonIndex === lessonCount - 1
          ? async () => {
              try {
                await onFinishTour?.();
              } catch {
                toast.error("Could not save the last lesson.");
              }
              router.push("/");
            }
          : undefined
      }
    />
  );
}
