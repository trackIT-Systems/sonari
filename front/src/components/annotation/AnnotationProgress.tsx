import { useMemo, useRef } from "react";

import Button, { getButtonClassName } from "@/components/Button";
import FilterBar from "@/components/filters/FilterBar";
import FilterMenu from "@/components/filters/FilterMenu";
import FilterPresets from "@/components/filters/FilterPresets";
import taskFilterDefs from "@/components/filters/tasks";
import { FilterIcon, NextIcon, PreviousIcon } from "@/components/icons";
import Tooltip from "@/components/Tooltip";
import KeyboardKey from "@/components/KeyboardKey";
import ShortcutHelper from "@/components/ShortcutHelper";
import Spinner from "@/components/Spinner";
import { computeAnnotationTasksProgress } from "@/utils/annotation_tasks";
import { useKeyPressEvent } from "react-use";

import type { AnnotationTaskFilter } from "@/api/annotation_tasks";
import type { Filter } from "@/hooks/utils/useFilter";
import type { AnnotationTask } from "@/types";
import {
  NEXT_TASK_SHORTCUT,
  PREV_TASK_SHORTCUT,
  FILTER_SHORTCUT,
  getSpecialKeyLabel,
  ROOT_NAVIGATION_SHORTCUTS,
  MISC_SHORTCUTS,
  TASK_STATE_SHORTCUTS,
  SPECTROGRAM_KEY_SHORTCUTS,
  SPECTRGRAM_NAVIGATION_SHORTCUTS,
  ANNOTATION_KEY_SHORTCUTS,
  NAVIGATION_KEY_SHORTCUTS,
  AUDIO_KEY_SHORTCUTS,
  TAG_HANDLING_SHORTCUTS,
} from "@/utils/keyboard";

const SHORTCUTS = [
  ...ROOT_NAVIGATION_SHORTCUTS,
  ...MISC_SHORTCUTS,
  ...TASK_STATE_SHORTCUTS,
  ...SPECTROGRAM_KEY_SHORTCUTS,
  ...SPECTRGRAM_NAVIGATION_SHORTCUTS,
  ...ANNOTATION_KEY_SHORTCUTS,
  ...NAVIGATION_KEY_SHORTCUTS,
  ...TAG_HANDLING_SHORTCUTS,
  ...AUDIO_KEY_SHORTCUTS,
];

export default function AnnotationProgress({
  current,
  tasks,
  filter,
  isLoading = false,
  onNext,
  onPrevious,
}: {
  current?: number | null;
  tasks: AnnotationTask[];
  filter: Filter<AnnotationTaskFilter>;
  isLoading?: boolean;
  onNext?: () => void;
  onPrevious?: () => void;
}) {
  const progress = useMemo(() => computeAnnotationTasksProgress(tasks), [tasks]);


  const filterButtonRef = useRef<HTMLButtonElement>(null);

  const filterBtn = <Button
    padding="p-1"
    mode="text"
    variant="info"
    autoFocus={false}
    ref={filterButtonRef}
  >
    <FilterIcon className="inline-block mr-1 w-5 h-5" />
    <span className="text-sm align-middle whitespace-nowrap">
      Filters
    </span>
  </Button>

  useKeyPressEvent(FILTER_SHORTCUT, (event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }
    const button = filterButtonRef.current;
    if (button instanceof HTMLButtonElement) {
      button.click();
    }
  });

  return (
    <div className="inline-flex gap-4 items-center h-full w-[63rem]">
      <Tooltip
        portal={true}
        tooltip={
          <div className="inline-flex gap-2 items-center">
            Previous Task
            <div className="text-xs">
              <KeyboardKey code={`${getSpecialKeyLabel("Shift")}`} /><KeyboardKey code={`${getSpecialKeyLabel(PREV_TASK_SHORTCUT)}`} />
            </div>
          </div>
        }
        placement="bottom"
      >
        <Button mode="text" padding="p-1" onClick={onPrevious}>
          <PreviousIcon className="inline-block w-8 h-8" />
        </Button>
      </Tooltip>
      <div className="flex flex-col px-2 py-2 rounded-lg border grow dark:border-stone-800">
        <div className="flex flex-wrap gap-4 items-center">
          <ShortcutHelper shortcuts={SHORTCUTS} />
          <span className="text-sm inline-flex gap-1 items-center whitespace-nowrap text-stone-500">
            <span className="text-stone-500">Current task:</span>
            <span className="font-bold text-blue-500">{current ? current + 1 : 0}</span>
          </span>
          <span className="text-sm inline-flex gap-1 items-center whitespace-nowrap text-stone-500">
            <span>Remaining tasks:</span>
            <span className="font-medium text-blue-500">{progress.pending.count}</span>
          </span>
          <span className="text-sm inline-flex gap-1 items-center whitespace-nowrap text-stone-500">
            <span>Total tasks:</span>
            <span className="font-medium text-blue-500">{progress.total}</span>
          </span>
          {isLoading ? (
            <div className="flex items-center justify-center px-3 py-1">
              <Spinner variant="info" className="w-5 h-5" />
              <span className="text-sm ml-2 text-stone-500">
                Filtering...
              </span>
            </div>
          ) : (
            <FilterMenu
              filter={filter}
              filterDef={taskFilterDefs}
              className={getButtonClassName({
                variant: "info",
                mode: "text",
                padding: "p-1",
              })}
              button={filterBtn}
            />
          )}
          {!isLoading && (
            <FilterPresets
              storageKey="presets:annotation_tasks"
              filter={filter}
              className="ml-2"
            />
          )}
          <FilterBar
            withLabel={false}
            filter={filter}
            filterDef={taskFilterDefs}
          />
        </div>
      </div>
      <Tooltip
        tooltip={
          <div className="inline-flex gap-2 items-center">
            Next Task
            <div className="text-xs">
              <KeyboardKey code={`${getSpecialKeyLabel("Shift")}`} /><KeyboardKey code={`${getSpecialKeyLabel(NEXT_TASK_SHORTCUT)}`} />
            </div>
          </div>
        }
        placement="bottom"
      >
        <Button mode="text" padding="p-1" onClick={onNext}>
          <NextIcon className="inline-block w-8 h-8" />
        </Button>
      </Tooltip>
    </div>
  );
}