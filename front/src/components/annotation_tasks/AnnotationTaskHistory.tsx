import { useMemo, useState } from "react";

import Card from "@/components/Card";
import Empty from "@/components/Empty";
import { H4 } from "@/components/Headings";
import { TimeIcon } from "@/components/icons";
import Loading from "@/components/Loading";
import Toggle from "@/components/inputs/Toggle";
import useAnnotationTaskHistory from "@/hooks/api/useAnnotationTaskHistory";
import {
  describeChange,
  describeOriginal,
  formatBounds,
  groupChangesByEdit,
} from "@/utils/soundEventHistory";

import type { AnnotationTask } from "@/types";

const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" });

/**
 * What reviewers changed on this task's sound events, compared with what the import
 * (for example a detector) created. Fetched only while the panel is open.
 */
export default function AnnotationTaskHistory({
  annotationTask,
  onSelectSoundEventAnnotation,
}: {
  annotationTask: AnnotationTask;
  /** Select an event that still exists, by id. */
  onSelectSoundEventAnnotation?: (soundEventAnnotationId: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const { history, isLoading, error } = useAnnotationTaskHistory({
    annotationTaskId: annotationTask.id,
    enabled: open,
  });

  const existingIds = useMemo(
    () => new Set((annotationTask.sound_event_annotations ?? []).map((sea) => sea.id)),
    [annotationTask.sound_event_annotations],
  );
  const groups = useMemo(() => groupChangesByEdit(history?.changes ?? []), [history]);

  const eventLink = (id: number | null | undefined) => {
    if (id == null) return null;
    const exists = existingIds.has(id);
    return exists && onSelectSoundEventAnnotation ? (
      <button
        type="button"
        className="font-mono text-emerald-600 hover:underline dark:text-emerald-400"
        onClick={() => onSelectSoundEventAnnotation(id)}
      >
        #{id}
      </button>
    ) : (
      <span className={`font-mono ${exists ? "" : "line-through text-stone-400"}`}>#{id}</span>
    );
  };

  return (
    <Card className="gap-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <H4 className="flex items-center gap-1.5 text-sm">
          <TimeIcon className="h-4 w-4 shrink-0" />
          Edit history
        </H4>
        <Toggle label="Show the edit history of this task" isSelected={open} onChange={setOpen} />
      </div>
      {!open ? null : isLoading ? (
        <Loading />
      ) : error != null || history == null ? (
        <Empty padding="p-1">The edit history could not be loaded.</Empty>
      ) : history.changes.length === 0 && history.originals.length === 0 ? (
        <Empty padding="p-1">No sound event of this task has been edited yet.</Empty>
      ) : (
        <div className="flex flex-col gap-3 text-xs">
          {history.originals.length > 0 && (
            <section>
              <h5 className="mb-1 font-semibold text-stone-500">Before the first edit</h5>
              <ul className="flex flex-col gap-0.5">
                {history.originals.map((original) => (
                  <li key={original.id} className="flex flex-wrap gap-x-1.5">
                    {eventLink(original.sound_event_annotation_id)}
                    <span>{describeOriginal(original)}</span>
                    <span className="text-stone-400">
                      {formatBounds(original.start_time, original.end_time, original.low_freq, original.high_freq)}
                      {original.created_by_username ? ` · ${original.created_by_username}` : ""}
                      {original.source === "guano" ? " · from GUANO" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {groups.length > 0 && (
            <section>
              <h5 className="mb-1 font-semibold text-stone-500">Changes</h5>
              <ol className="flex flex-col gap-2">
                {groups.map((group) => (
                  <li key={group.editId}>
                    <div className="text-stone-400">
                      {timeFormat.format(group.time)}
                      {group.username ? ` · ${group.username}` : ""}
                    </div>
                    <ul className="flex flex-col gap-0.5">
                      {group.changes.map((change) => (
                        <li key={change.id} className="flex flex-wrap gap-x-1.5">
                          {eventLink(change.sound_event_annotation_id)}
                          <span>{describeChange(change)}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      )}
    </Card>
  );
}
