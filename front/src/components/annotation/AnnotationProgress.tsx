import { useMemo, useRef } from "react";

import Button, { getButtonClassName } from "@/components/Button";
import FilterBar from "@/components/filters/FilterBar";
import FilterMenu from "@/components/filters/FilterMenu";
import taskFilterDefs from "@/components/filters/tasks";
import { FilterIcon, NextIcon, PreviousIcon } from "@/components/icons";
import Tooltip from "@/components/Tooltip";
import Dialog from "@/components/Dialog";
import KeyboardKey from "@/components/KeyboardKey";
import ShortcutHelper from "@/components/ShortcutHelper";
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
} from "@/utils/keyboard";

const SHORTCUTS = [
  ...ROOT_NAVIGATION_SHORTCUTS,
  ...MISC_SHORTCUTS,
  ...TASK_STATE_SHORTCUTS,
  ...SPECTROGRAM_KEY_SHORTCUTS,
  ...SPECTRGRAM_NAVIGATION_SHORTCUTS,
  ...ANNOTATION_KEY_SHORTCUTS,
  ...NAVIGATION_KEY_SHORTCUTS,
  ...AUDIO_KEY_SHORTCUTS,
];

export default function AnnotationProgress({
  current,
  instructions,
  tasks,
  filter,
  onNext,
  onPrevious,
}: {
  current?: number | null;
  instructions: string;
  tasks: AnnotationTask[];
  filter: Filter<AnnotationTaskFilter>;
  onNext?: () => void;
  onPrevious?: () => void;
}) {
  const {
    missing: pending,
    completed: complete,
    verified,
    needReview,
    total,
  } = useMemo(() => computeAnnotationTasksProgress(tasks), [tasks]);


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
    <div className="inline-flex gap-1 items-center h-full w-full">
      <Tooltip
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
      <div className="inline-flex gap-4 items-center px-2 h-full rounded-lg border grow dark:border-stone-800">
        <ShortcutHelper shortcuts={SHORTCUTS} />
        <span className="text-sm inline-flex gap-1 items-center whitespace-nowrap text-stone-500">
          <span className="text-stone-500">Current task:</span>
          <span className="font-bold text-blue-500">{current ? current + 1 : 0}</span>
        </span>
        <span className="text-sm inline-flex gap-1 items-center whitespace-nowrap text-stone-500">
          <span>Remaining tasks:</span>
          <span className="font-medium text-blue-500">{pending}</span>
        </span>
        <span className="text-sm inline-flex gap-1 items-center whitespace-nowrap text-stone-500">
          <span>Total tasks:</span>
          <span className="font-medium text-blue-500">{total}</span>
        </span>
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
          <FilterBar
            withLabel={false}
            filter={filter}
            filterDef={taskFilterDefs}
          />
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
