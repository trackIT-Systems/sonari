import type { AnnotationTask, Tag } from "@/types";

function tagId(tag: Tag): string {
  return `${tag.key}-${tag.value}`;
}

function soundEventTagIds(task: AnnotationTask): Set<string> {
  const tags = task.sound_event_tags?.length
    ? task.sound_event_tags
    : (task.sound_event_annotations || []).flatMap((event) => event.tags || []);
  return new Set(tags.map(tagId));
}

/** Absolute start of a task in seconds, or null if the recording has no date/time. */
function absoluteStart(task: AnnotationTask): number | null {
  const date = task.recording?.date;
  const time = task.recording?.time;
  if (date == null || time == null) return null;
  const [h, m, s] = time.split(":").map(Number);
  const dayStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 1000;
  return dayStart + h * 3600 + m * 60 + s + task.start_time;
}

/**
 * Returns the ids of tasks that are temporally related to another task
 * sharing at least one sound event tag. Two tasks are related when the gap
 * between the end of the earlier one and the start of the later one is at
 * most `windowSeconds` (overlaps count as related).
 */
export function findTemporallyRelatedTasks(
  tasks: AnnotationTask[],
  windowSeconds: number,
): Set<number> {
  const entries = tasks
    .map((task) => ({
      id: task.id,
      start: absoluteStart(task),
      duration: task.end_time - task.start_time,
      tags: soundEventTagIds(task),
    }))
    .filter((e): e is typeof e & { start: number } => e.start != null && e.tags.size > 0)
    .sort((a, b) => a.start - b.start);

  const related = new Set<number>();
  // Per tag: the latest end time seen so far and the task that produced it.
  const lastByTag = new Map<string, { end: number; id: number }>();

  for (const entry of entries) {
    for (const tag of Array.from(entry.tags)) {
      const last = lastByTag.get(tag);
      if (last && entry.start - last.end <= windowSeconds) {
        related.add(entry.id);
        related.add(last.id);
      }
      const end = entry.start + entry.duration;
      if (!last || end > last.end) {
        lastByTag.set(tag, { end, id: entry.id });
      }
    }
  }
  return related;
}
