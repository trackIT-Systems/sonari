import type { SoundEventChange, SoundEventOriginal } from "@/api/annotation_tasks";

/** Changes of one edit session (or one bulk action), newest session first. */
export type EditGroup = {
  editId: string;
  username: string | null;
  /** Time of the last change in the session. */
  time: Date;
  changes: SoundEventChange[];
};

export function groupChangesByEdit(changes: SoundEventChange[]): EditGroup[] {
  const groups = new Map<string, EditGroup>();
  for (const change of changes) {
    const time = change.updated_on ?? change.created_on;
    const group = groups.get(change.edit_id);
    if (group == null) {
      groups.set(change.edit_id, {
        editId: change.edit_id,
        username: change.username ?? null,
        time,
        changes: [change],
      });
    } else {
      group.changes.push(change);
      if (time > group.time) group.time = time;
    }
  }
  return Array.from(groups.values()).sort((a, b) => b.time.getTime() - a.time.getTime());
}

function formatFrequency(hz: number): string {
  return hz >= 1000 ? `${(hz / 1000).toFixed(1)} kHz` : `${Math.round(hz)} Hz`;
}

export function formatBounds(
  start?: number | null,
  end?: number | null,
  low?: number | null,
  high?: number | null,
): string {
  if (start == null || end == null) return "";
  const time = `${start.toFixed(2)}–${end.toFixed(2)} s`;
  if (low == null || high == null) return time;
  return `${time}, ${formatFrequency(low)}–${formatFrequency(high)}`;
}

function tagLabel(key?: string | null, value?: string | null): string {
  return key ? `${key}: ${value ?? ""}` : value ?? "";
}

export function describeChange(change: SoundEventChange): string {
  switch (change.action) {
    case "created":
      return `Created (${formatBounds(change.new_start_time, change.new_end_time, change.new_low_freq, change.new_high_freq)})`;
    case "deleted":
      return "Deleted";
    case "geometry_changed":
      return `Box ${formatBounds(change.old_start_time, change.old_end_time, change.old_low_freq, change.old_high_freq)} → ${formatBounds(change.new_start_time, change.new_end_time, change.new_low_freq, change.new_high_freq)}`;
    case "tag_added":
      return `Added ${tagLabel(change.new_tag_key, change.new_tag_value)}`;
    case "tag_removed":
      return `Removed ${tagLabel(change.old_tag_key, change.old_tag_value)}`;
    case "tag_replaced":
      return change.old_tag_key === change.new_tag_key
        ? `${change.old_tag_key}: ${change.old_tag_value} → ${change.new_tag_value}`
        : `${tagLabel(change.old_tag_key, change.old_tag_value)} → ${tagLabel(change.new_tag_key, change.new_tag_value)}`;
  }
}

export function describeOriginal(original: SoundEventOriginal): string {
  const tags = original.tags
    .map((tag) =>
      tag.confidence != null
        ? `${tag.tag_value} (${Math.round(tag.confidence * 100)} %)`
        : tag.tag_value,
    )
    .join(", ");
  return tags || "No tags";
}
