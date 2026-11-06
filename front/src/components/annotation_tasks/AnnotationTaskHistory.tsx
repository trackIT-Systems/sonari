import { useEffect, useMemo, useState } from "react";

import Card from "@/components/Card";
import Empty from "@/components/Empty";
import { H4 } from "@/components/Headings";
import { TimeIcon } from "@/components/icons";
import Loading from "@/components/Loading";
import Toggle from "@/components/inputs/Toggle";
import { TIMELINE_COLORS } from "@/hooks/annotation/useTimelineDraw";
import useAnnotationTaskHistory from "@/hooks/api/useAnnotationTaskHistory";
import {
  buildTimeline,
  describeStep,
  formatBounds,
  formatTags,
  geometryBounds,
  previewStep,
} from "@/utils/soundEventTimeline";

import type { AnnotationTask } from "@/types";
import type { TimelinePreview, TimelineStep } from "@/utils/soundEventTimeline";

const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" });

/**
 * What reviewers changed on this task's sound events, compared with what the import
 * (for example a detector) created. Fetched only while the panel is open.
 */
export default function AnnotationTaskHistory({
  annotationTask,
  onSelectSoundEventAnnotation,
  onPreviewChange,
}: {
  annotationTask: AnnotationTask;
  /** Select an event that still exists, by id. */
  onSelectSoundEventAnnotation?: (soundEventAnnotationId: number) => void;
  /** Show a past step in the spectrogram; null shows the current events again. */
  onPreviewChange?: (preview: TimelinePreview | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const { history, isLoading, error } = useAnnotationTaskHistory({
    annotationTaskId: annotationTask.id,
    enabled: open,
  });

  const current = annotationTask.sound_event_annotations;
  const steps = useMemo(
    () => (history != null ? buildTimeline(current ?? [], history) : []),
    [history, current],
  );
  // Null: now. Reset when another task is shown.
  const [stepIndex, setStepIndex] = useState<number | null>(null);
  useEffect(() => setStepIndex(null), [annotationTask.id]);
  const lastIndex = steps.length - 1;
  const selected = stepIndex != null && stepIndex < lastIndex ? stepIndex : null;

  useEffect(() => {
    if (!open || selected == null || steps[selected] == null) {
      onPreviewChange?.(null);
      return;
    }
    onPreviewChange?.(previewStep(steps[selected], current ?? [], annotationTask));
  }, [open, selected, steps, current, annotationTask, onPreviewChange]);
  useEffect(() => () => onPreviewChange?.(null), [onPreviewChange]);

  const existingIds = useMemo(
    () => new Set((annotationTask.sound_event_annotations ?? []).map((sea) => sea.id)),
    [annotationTask.sound_event_annotations],
  );
  // What each session changed, newest first; sessions without a net change are left out.
  const groups = useMemo(
    () =>
      steps
        .map((step, index) => ({
          step,
          index,
          changes: index > 0 ? describeStep(steps[index - 1].state, step.state) : [],
        }))
        .filter((group) => group.index > 0 && group.step.editId != null && group.changes.length > 0)
        .reverse(),
    [steps],
  );
  // The import's state of every event that was edited since.
  const imported = useMemo(() => {
    if (steps.length < 2) return [];
    const now = steps[steps.length - 1].state;
    return Array.from(steps[0].state.values()).filter((event) => now.get(event.id) !== event);
  }, [steps]);

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
      ) : history.versions.length === 0 && groups.length === 0 ? (
        <Empty padding="p-1">No sound event of this task has been edited yet.</Empty>
      ) : (
        <div className="flex flex-col gap-3 text-xs">
          {steps.length > 1 && (
            <TimelineSlider
              steps={steps}
              selected={selected ?? lastIndex}
              onChange={(index) => setStepIndex(index >= lastIndex ? null : index)}
            />
          )}
          {imported.length > 0 && (
            <section>
              <h5 className="mb-1 font-semibold text-stone-500">Before the first edit</h5>
              <ul className="flex flex-col gap-0.5">
                {imported.map((event) => (
                  <li key={event.id} className="flex flex-wrap gap-x-1.5">
                    {event.id > 0 ? eventLink(event.id) : <span className="text-stone-400">deleted</span>}
                    <span>{formatTags(event.tags)}</span>
                    <span className="text-stone-400">
                      {formatBounds(geometryBounds(event.geometry))}
                      {event.createdBy ? ` · ${event.createdBy}` : ""}
                      {event.fromGuano ? " · from GUANO" : ""}
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
                {groups.map(({ step, index, changes }) => (
                  <li key={step.editId ?? index}>
                    <div className="text-stone-400">
                      {step.time != null ? timeFormat.format(step.time) : ""}
                      {step.username ? ` · ${step.username}` : ""}
                    </div>
                    <ul className="flex flex-col gap-0.5">
                      {changes.map((change, i) => (
                        <li key={`${change.eventId}-${i}`} className="flex flex-wrap gap-x-1.5">
                          {change.eventId > 0 ? eventLink(change.eventId) : null}
                          <span>{change.text}</span>
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

function stepLabel(step: TimelineStep, isNow: boolean): string {
  if (step.kind === "import") return "Import (before any recorded edit)";
  const parts = [
    step.time != null ? timeFormat.format(step.time) : null,
    step.username,
  ].filter(Boolean);
  const label = parts.join(" · ");
  return isNow ? (label ? `Now (last edit: ${label})` : "Now") : `After edit: ${label}`;
}

function LegendSwatch({ color, dashed, label }: { color: string; dashed?: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="inline-block h-2.5 w-3.5 rounded-sm border-2"
        style={{ borderColor: color, borderStyle: dashed ? "dashed" : "solid" }}
      />
      {label}
    </span>
  );
}

/** Step through the task's edit sessions; the spectrogram shows the selected step. */
function TimelineSlider({
  steps,
  selected,
  onChange,
}: {
  steps: TimelineStep[];
  selected: number;
  onChange: (index: number) => void;
}) {
  const lastIndex = steps.length - 1;
  const isNow = selected >= lastIndex;
  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded px-1.5 text-stone-500 hover:bg-stone-100 disabled:opacity-40 dark:hover:bg-stone-800"
          onClick={() => onChange(selected - 1)}
          disabled={selected <= 0}
          aria-label="Previous step"
        >
          ◀
        </button>
        <input
          type="range"
          min={0}
          max={lastIndex}
          step={1}
          value={selected}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full accent-emerald-500"
          aria-label="Edit history step shown in the spectrogram"
        />
        <button
          type="button"
          className="rounded px-1.5 text-stone-500 hover:bg-stone-100 disabled:opacity-40 dark:hover:bg-stone-800"
          onClick={() => onChange(selected + 1)}
          disabled={isNow}
          aria-label="Next step"
        >
          ▶
        </button>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className={isNow ? "text-stone-500" : "font-medium text-amber-700 dark:text-amber-400"}>
          {stepLabel(steps[selected], isNow)}
        </span>
        {!isNow && (
          <button
            type="button"
            className="shrink-0 text-emerald-600 hover:underline dark:text-emerald-400"
            onClick={() => onChange(lastIndex)}
          >
            Back to now
          </button>
        )}
      </div>
      {!isNow && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-stone-500">
          <LegendSwatch color={TIMELINE_COLORS.unchanged} label="as now" />
          <LegendSwatch color={TIMELINE_COLORS.changed} label="changed later" />
          <LegendSwatch color={TIMELINE_COLORS.removedLater} dashed label="deleted later" />
          <LegendSwatch color={TIMELINE_COLORS.addedLater} dashed label="added later" />
          <span>Read-only while a past step is shown.</span>
        </div>
      )}
    </section>
  );
}
