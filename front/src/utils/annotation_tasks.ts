import type { AnnotationTask } from "@/types";
import { WHOMBATDETECT_USERS } from "@/constants";

export function computeAnnotationTasksProgress(
  annotationTasks: AnnotationTask[],
) {
  let missing = annotationTasks.length;
  let needReview = 0;
  let completed = 0;
  let unsure = 0;
  let verified = 0;
  for (const task of annotationTasks) {
    let isVerified = false;
    let isCompleted = false;
    let needsReview = false;
    let isUnsure = false;
    let alreadyMissing = false;

    task.status_badges?.forEach(({ state, user }) => {
      switch (state) {
        case "verified":
          isVerified = true;
          break;
        case "rejected":
          if (!user || WHOMBATDETECT_USERS.includes(user.username)) {
            break
          }
          needsReview = true;
          break;
        case "completed":
          isCompleted = true;
          break;
        case "assigned":
          isUnsure = true;
          break
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
      if (!alreadyMissing) {
        missing -= 1;
        alreadyMissing = true;
      }
    }

    if (isUnsure) {
      unsure += 1;
    }
  }
  return {
    missing,
    needReview,
    completed,
    verified,
    unsure,
    total: annotationTasks.length,
  };
}
