import classNames from "classnames";
import { useMemo } from "react";
import { useKeyPressEvent } from "react-use";

import {
  BackIcon,
  CompleteIcon,
  NeedsReviewIcon,
  TimeIcon,
  VerifiedIcon,
} from "@/components/icons";
import KeyboardKey from "@/components/KeyboardKey";
import Tooltip from "@/components/Tooltip";
import useAnnotationTaskTimeNeighbours from "@/hooks/api/useAnnotationTaskTimeNeighbours";
import useKeyFilter from "@/hooks/utils/useKeyFilter";
import { TIME_NEXT_TASK_SHORTCUT, TIME_PREV_TASK_SHORTCUT } from "@/utils/keyboard";
import { absoluteStart } from "@/utils/temporalClusters";

import type { AnnotationTask } from "@/types";

/** Tasks starting further away than this, in seconds, are not shown */
export const MAX_TIME_OFFSET = 10;

/** Tag keys that are not species; the same as the project's species chart leaves out */
const NON_SPECIES_TAG_KEYS = new Set(["pass", "type"]);

/** The species (sound event tag values, without passes or call types) of a task, without repeats */
export function taskSpecies(task: AnnotationTask): string[] {
  const tags = task.sound_event_tags?.length
    ? task.sound_event_tags
    : (task.sound_event_annotations ?? []).flatMap((event) => event.tags ?? []);
  return Array.from(
    new Set(tags.filter((tag) => !NON_SPECIES_TAG_KEYS.has(tag.key)).map((tag) => tag.value)),
  );
}

/** "−2 min 10 s", "+4 s", "+1 h 5 min": how far a task starts from another */
export function formatOffset(seconds: number): string {
  const sign = seconds < 0 ? "−" : "+";
  const total = Math.round(Math.abs(seconds));
  if (total < 60) return `${sign}${total} s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 10) {
    const rest = total % 60;
    return rest ? `${sign}${minutes} min ${rest} s` : `${sign}${minutes} min`;
  }
  if (minutes < 60) return `${sign}${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest ? `${sign}${hours} h ${rest} min` : `${sign}${hours} h`;
  }
  return `${sign}${Math.round(hours / 24)} d`;
}

function StatusIcon({ task }: { task: AnnotationTask }) {
  const states = new Set((task.status_badges ?? []).map((badge) => badge.state));
  if (states.has("verified")) return <VerifiedIcon className="h-4 w-4 text-blue-500" />;
  if (states.has("rejected")) return <NeedsReviewIcon className="h-4 w-4 text-red-500" />;
  if (states.has("completed")) return <CompleteIcon className="h-4 w-4 text-emerald-500" />;
  return null;
}

function SpeciesList({ species, current }: { species: string[]; current: Set<string> }) {
  if (species.length === 0) {
    return <span className="italic text-stone-400">no species</span>;
  }
  // Show a species this task lacks first: another species close in time
  // may be the same animal, labelled differently
  const shown = species.find((value) => !current.has(value)) ?? species[0];
  const others = species.length - 1;
  return (
    <span className="flex min-w-0 items-center gap-1">
      <span
        className={classNames(
          "truncate font-medium",
          current.has(shown) ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400",
        )}
      >
        {shown}
      </span>
      {others > 0 && <span className="shrink-0 text-stone-400">+ {others} {others === 1 ? "other" : "others"}</span>}
    </span>
  );
}

function NeighbourChip({
  task,
  offset,
  inFilter,
  currentSpecies,
  shortcut,
  onOpen,
}: {
  task: AnnotationTask;
  offset: number | null;
  inFilter: boolean;
  currentSpecies: Set<string>;
  shortcut?: string;
  onOpen: () => void;
}) {
  const fileName = task.recording?.path.split(/[\\/]/).pop() ?? "";
  return (
    <Tooltip
      portal
      placement="bottom"
      tooltip={
        <div className="flex flex-col gap-1 text-xs">
          {taskSpecies(task).length > 1 && <span>{taskSpecies(task).join(", ")}</span>}
          <span>{fileName}</span>
          <span>
            {task.start_time.toFixed(1)}–{task.end_time.toFixed(1)} s in the recording
          </span>
          <span>{inFilter ? "In your filter" : "Outside your filter"}</span>
          {shortcut && (
            <span className="inline-flex items-center gap-1">
              Open with <KeyboardKey code={shortcut} />
            </span>
          )}
        </div>
      }
    >
      <button
        type="button"
        onClick={(event) => {
          onOpen();
          // Focused buttons block the keyboard shortcuts
          event.currentTarget.blur();
        }}
        className={classNames(
          "flex min-w-0 max-w-[14rem] items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors hover:border-emerald-500",
          inFilter
            ? "border-stone-300 dark:border-stone-600"
            : "border-dashed border-stone-300 dark:border-stone-600",
        )}
      >
        <span className="shrink-0 tabular-nums text-stone-500">
          {offset == null ? "?" : formatOffset(offset)}
        </span>
        <SpeciesList species={taskSpecies(task)} current={currentSpecies} />
        <StatusIcon task={task} />
      </button>
    </Tooltip>
  );
}

/**
 * The tasks just before and after the open one in time, ignoring the filter,
 * to check e.g. whether the same animal got another species a moment earlier.
 */
export default function TaskTimeStrip({
  task,
  inFilterIds,
  tripAnchorTaskId,
  onVisit,
  onBack,
}: {
  task: AnnotationTask;
  /** Ids of the tasks the filter matches */
  inFilterIds: Set<number>;
  /** Set while the open task is outside the filter, opened from this strip */
  tripAnchorTaskId: number | null;
  onVisit: (task: AnnotationTask) => void;
  onBack: () => void;
}) {
  const { neighbours, isLoading, isStale } = useAnnotationTaskTimeNeighbours({ annotationTaskId: task.id });
  const start = absoluteStart(task);
  const currentSpecies = useMemo(() => new Set(taskSpecies(task)), [task]);

  // Only neighbours of the open task: a stale list (while the next loads) must not open
  const fresh = neighbours != null && !isStale;

  const offsetOf = (other: AnnotationTask) => {
    const otherStart = absoluteStart(other);
    return start == null || otherStart == null ? null : otherStart - start;
  };
  const isClose = (other: AnnotationTask) => {
    const offset = offsetOf(other);
    return offset != null && Math.abs(offset) <= MAX_TIME_OFFSET;
  };
  // Nearest first, so the close ones are a prefix
  const before = (neighbours?.before ?? []).filter(isClose);
  const after = (neighbours?.after ?? []).filter(isClose);

  useKeyPressEvent(useKeyFilter({ key: TIME_PREV_TASK_SHORTCUT }), () => {
    if (fresh && before[0] != null) onVisit(before[0]);
  });
  useKeyPressEvent(useKeyFilter({ key: TIME_NEXT_TASK_SHORTCUT }), () => {
    if (fresh && after[0] != null) onVisit(after[0]);
  });

  if (start == null) return null;

  return (
    <div className="flex flex-col gap-2">
      {tripAnchorTaskId != null && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-amber-500/40 bg-amber-50 px-3 py-1.5 text-sm dark:bg-amber-900/20">
          <span>
            This task is outside your filter. Next and previous continue from the task you left.
          </span>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1 font-medium text-emerald-600 hover:underline dark:text-emerald-400"
          >
            <BackIcon className="h-4 w-4" />
            Back to that task
          </button>
        </div>
      )}
      <div className="flex min-w-0 flex-row flex-wrap items-center gap-1.5">
        <Tooltip
          portal
          placement="bottom-start"
          tooltip={
            <div className="flex w-80 flex-col gap-1 whitespace-normal text-xs">
              <span>
                The tasks starting up to {MAX_TIME_OFFSET} s before or after this one,
                whatever the filter. Dashed: outside your filter.
              </span>
              <span>
                <span className="text-emerald-500">Green</span>: a species this task has too.{" "}
                <span className="text-amber-500">Amber</span>: another species.
              </span>
              <span className="inline-flex items-center gap-1">
                <KeyboardKey code={TIME_PREV_TASK_SHORTCUT} /> earlier,{" "}
                <KeyboardKey code={TIME_NEXT_TASK_SHORTCUT} /> later
              </span>
            </div>
          }
        >
          <span className="inline-flex items-center gap-1 text-xs text-stone-500">
            <TimeIcon className="h-4 w-4" />
            In time
          </span>
        </Tooltip>
        {before.length === 0 && after.length === 0 && !isLoading && (
          <span className="text-xs italic text-stone-400">
            No other task within {MAX_TIME_OFFSET} s
          </span>
        )}
        {[...before].reverse().map((other) => (
          <NeighbourChip
            key={other.id}
            task={other}
            offset={offsetOf(other)}
            inFilter={inFilterIds.has(other.id)}
            currentSpecies={currentSpecies}
            shortcut={other.id === before[0]?.id ? TIME_PREV_TASK_SHORTCUT : undefined}
            onOpen={() => onVisit(other)}
          />
        ))}
        {(before.length > 0 || after.length > 0) && (
          <span className="mx-1 rounded-md bg-emerald-500 px-2 py-1 text-xs font-medium text-white">
            This task
          </span>
        )}
        {after.map((other) => (
          <NeighbourChip
            key={other.id}
            task={other}
            offset={offsetOf(other)}
            inFilter={inFilterIds.has(other.id)}
            currentSpecies={currentSpecies}
            shortcut={other.id === after[0]?.id ? TIME_NEXT_TASK_SHORTCUT : undefined}
            onOpen={() => onVisit(other)}
          />
        ))}
      </div>
    </div>
  );
}
