import { Fragment, useMemo, useState } from "react";

import Card from "@/components/Card";
import Empty from "@/components/Empty";
import { H4 } from "@/components/Headings";
import { SoundEventIcon } from "@/components/icons";
import Loading from "@/components/Loading";
import Toggle from "@/components/inputs/Toggle";
import useAnnotationTaskMainFrequencies from "@/hooks/api/useAnnotationTaskMainFrequencies";
import { groupMainFrequencies, soundEventStartTime } from "@/utils/mainFrequencies";

import type { AnnotationTask } from "@/types";

function formatKHz(frequency: number | null): string {
  return frequency == null ? "–" : (frequency / 1000).toFixed(1);
}

/**
 * Main (peak) frequency of the task's calls, per species and call type, each
 * group expandable to its calls. Measured only while the panel is open.
 */
export default function AnnotationTaskMainFrequencies({
  annotationTask,
  onSelectSoundEventAnnotation,
}: {
  annotationTask: AnnotationTask;
  /** Select a call's sound event, by id. */
  onSelectSoundEventAnnotation?: (soundEventAnnotationId: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const soundEventAnnotations = useMemo(
    () => annotationTask.sound_event_annotations ?? [],
    [annotationTask.sound_event_annotations],
  );
  const { frequencies, isLoading, isFetching, error } = useAnnotationTaskMainFrequencies({
    annotationTaskId: annotationTask.id,
    soundEventAnnotations,
    enabled: open && soundEventAnnotations.length > 0,
  });
  const groups = useMemo(
    () => groupMainFrequencies(soundEventAnnotations, frequencies),
    [soundEventAnnotations, frequencies],
  );

  const toggleGroup = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <Card className="gap-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <H4 className="flex items-center gap-1.5 text-sm">
          <SoundEventIcon className="h-4 w-4 shrink-0" />
          Main frequencies
          {open && isFetching && !isLoading && (
            <span className="text-xs font-normal text-stone-400">measuring…</span>
          )}
        </H4>
        <Toggle label="Show the main frequencies of this task's calls" isSelected={open} onChange={setOpen} />
      </div>
      {!open ? null : soundEventAnnotations.length === 0 ? (
        <Empty padding="p-1">This task has no sound events.</Empty>
      ) : isLoading ? (
        <Loading />
      ) : error != null ? (
        <Empty padding="p-1">The main frequencies could not be measured.</Empty>
      ) : (
        <div className="flex flex-col gap-1 text-xs">
          <table className="w-full tabular-nums">
            <thead className="text-left text-stone-500">
              <tr>
                <th className="py-1 font-semibold">Species</th>
                <th className="py-1 font-semibold">Type</th>
                <th className="py-1 text-right font-semibold">n</th>
                <th className="py-1 text-right font-semibold">Median</th>
                <th className="py-1 text-right font-semibold">Min–max (kHz)</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => {
                const isExpanded = expanded.has(group.key);
                return (
                  <Fragment key={group.key}>
                    <tr
                      className="cursor-pointer border-t border-stone-200 hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
                      onClick={() => toggleGroup(group.key)}
                    >
                      <td className="py-1">
                        <button
                          type="button"
                          aria-expanded={isExpanded}
                          className="text-left"
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleGroup(group.key);
                          }}
                        >
                          <span className="inline-block w-3 text-stone-400">{isExpanded ? "▾" : "▸"}</span>
                          {group.species ?? <span className="text-stone-400">No species</span>}
                        </button>
                      </td>
                      <td className="py-1">{group.type ?? <span className="text-stone-400">–</span>}</td>
                      <td className="py-1 text-right">{group.calls.length}</td>
                      <td className="py-1 text-right font-semibold">{formatKHz(group.median)}</td>
                      <td className="py-1 text-right">
                        {group.min == null ? "–" : `${formatKHz(group.min)}–${formatKHz(group.max)}`}
                      </td>
                    </tr>
                    {isExpanded &&
                      group.calls.map(({ soundEventAnnotation, frequency }) => (
                        <tr key={soundEventAnnotation.id} className="text-stone-500">
                          <td className="py-0.5 pl-3" colSpan={2}>
                            <button
                              type="button"
                              className="text-emerald-600 hover:underline dark:text-emerald-400"
                              onClick={() => onSelectSoundEventAnnotation?.(soundEventAnnotation.id)}
                            >
                              {(soundEventStartTime(soundEventAnnotation) - annotationTask.start_time).toFixed(3)} s
                            </button>
                          </td>
                          <td />
                          <td className="py-0.5 text-right">{formatKHz(frequency)}</td>
                          <td />
                        </tr>
                      ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          <p className="text-stone-400">
            Peak frequency of each call within its box (10–110 kHz without one), in kHz.
          </p>
        </div>
      )}
    </Card>
  );
}
