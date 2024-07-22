import type { AnnotationTask } from "@/types";

export function computeAnnotationTasksProgress(
  annotationTasks: AnnotationTask[],
) {
  let missing = annotationTasks.length;
  let needReview = 0;
  let completed = 0;
  let verified = 0;
  for (const task of annotationTasks) {
    let isVerified = false;
    let isCompleted = false;
    let needsReview = false;
    let alreadyMissing = false;

    task.status_badges?.forEach(({ state }) => {
      switch (state) {
        case "verified":
          isVerified = true;
          break;
        case "rejected":
          needsReview = true;
          break;
        case "completed":
          isCompleted = true;
          break;
      }
    });

    if (isVerified) {
      verified += 1;
      if (!alreadyMissing) {
        missing -= 1;
        alreadyMissing = true;
      }
    }

    if (isCompleted) {
      completed += 1;
      if (!alreadyMissing) {
        missing -= 1;
        alreadyMissing = true;
      }
    }

    if (needsReview) {
      needReview += 1;
    }
  }
  return {
    missing,
    needReview,
    completed,
    verified,
    total: annotationTasks.length,
  };
}
