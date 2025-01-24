import type { AnnotationTask } from "@/types";

export function computeAnnotationTasksProgress(
  annotationTasks: AnnotationTask[],
) {
  let pendingCount = 0;
  let doneCount = 0;

  // For tasks that are done, count their specific states
  let verifiedCount = 0;
  let rejectedCount = 0;
  let completedCount = 0;
  let assignedCount = 0;

  for (const task of annotationTasks) {
    let isVerified = false;
    let isCompleted = false;
    let isRejected = false;
    let isAssigned = false;
    
    // If no status badges, it's pending
    if (!task.status_badges || task.status_badges.length === 0) {
      pendingCount += 1;
      continue;
    }

    // Count all states for this task
    task.status_badges.forEach(({ state }) => {
      switch (state) {
        case "verified":
          isVerified = true;
          break;
        case "rejected":
          isRejected = true;
          break;
        case "completed":
          isCompleted = true;
          break;
        case "assigned":
          isAssigned = true;
          break;
      }
    });

    
    if (isVerified) verifiedCount += 1;
    if (isRejected) rejectedCount += 1;
    if (isCompleted) completedCount += 1;
    if (isAssigned) assignedCount += 1;
    
    // Determine if the task is done or pending
    const isDone = isVerified || isRejected || isCompleted;
    if (isDone) {
      doneCount += 1;
    } else {
      pendingCount += 1;
    }
  }

  const total = annotationTasks.length;
  
  return {
    total,
    done: {
      count: doneCount,
      verified: verifiedCount,
      rejected: rejectedCount,
      completed: completedCount
    },
    pending: {
      count: pendingCount,
      assigned: assignedCount,
    },
  };
}
