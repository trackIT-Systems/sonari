import { Fragment, useMemo } from "react";
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
  Transition,
} from "@headlessui/react";

import { CheckIcon, ExpandIcon } from "@/components/icons";

import type { AnnotationTask } from "@/types";

const CURRENT_TASK_VALUE = "__current__";
const TASK_DROPDOWN_LABEL_MAX_LENGTH = 12;

function formatTaskTimeRange(startTime: number, endTime: number): string {
  return `${startTime.toFixed(1)}s – ${endTime.toFixed(1)}s`;
}

function getProjectName(task: AnnotationTask): string {
  return (
    task.annotation_project?.name ??
    (task.annotation_project_id != null
      ? `Project #${task.annotation_project_id}`
      : "Unknown project")
  );
}

function truncateLabel(label: string, maxLength: number): string {
  if (label.length <= maxLength) {
    return label;
  }
  return `${label.slice(0, maxLength - 1)}…`;
}

function formatTaskLabel(task: AnnotationTask, currentTaskId: number): string {
  const projectName = getProjectName(task);
  const timeRange = formatTaskTimeRange(task.start_time, task.end_time);
  const suffix = task.id === currentTaskId ? " (current)" : "";
  return `${projectName} · ${timeRange}${suffix}`;
}

type SourceOption = {
  id: string | number;
  value: string;
  menuLabel: string;
  buttonLabel: string;
};

export default function AnnotationTaskSourceSelector({
  currentTaskId,
  annotationTaskSources,
  sourceTaskId,
  onSourceTaskChange,
  disabled = false,
}: {
  currentTaskId: number;
  annotationTaskSources: AnnotationTask[];
  sourceTaskId: number | null;
  onSourceTaskChange: (sourceTaskId: number | null) => void;
  disabled?: boolean;
}) {
  const options = useMemo((): SourceOption[] => {
    const currentOption: SourceOption = {
      id: CURRENT_TASK_VALUE,
      value: CURRENT_TASK_VALUE,
      menuLabel: "Current task",
      buttonLabel: "Current task",
    };

    const taskOptions: SourceOption[] = annotationTaskSources
      .filter((task) => task.id !== currentTaskId)
      .map((task) => {
        const projectName = getProjectName(task);
        return {
          id: task.id,
          value: task.id.toString(),
          menuLabel: formatTaskLabel(task, currentTaskId),
          buttonLabel: truncateLabel(projectName, TASK_DROPDOWN_LABEL_MAX_LENGTH),
        };
      });

    return [currentOption, ...taskOptions];
  }, [annotationTaskSources, currentTaskId]);

  const selectedValue =
    sourceTaskId == null ? CURRENT_TASK_VALUE : sourceTaskId.toString();

  const selected = useMemo(
    () => options.find((option) => option.value === selectedValue) ?? options[0],
    [options, selectedValue],
  );

  if (options.length <= 1) {
    return null;
  }

  const handleChange = (value: string) => {
    if (value === CURRENT_TASK_VALUE) {
      onSourceTaskChange(null);
      return;
    }
    onSourceTaskChange(parseInt(value, 10));
  };

  return (
    <div className="inline-flex shrink-0 items-center gap-2">
      <Listbox value={selectedValue} onChange={handleChange} disabled={disabled}>
        <div className="relative">
          <ListboxButton className="flex flex-row items-center px-2 py-1 rounded-md border border-stone-300 bg-stone-100 dark:border-stone-600 dark:bg-stone-700 text-sm text-stone-700 dark:text-stone-300 disabled:opacity-50 disabled:cursor-not-allowed">
            <span className="max-w-[12rem] truncate">{selected.buttonLabel}</span>
            <ExpandIcon className="w-4 h-4 ml-1 shrink-0" />
          </ListboxButton>
          <Transition
            as={Fragment}
            enter="transition ease-out duration-100"
            enterFrom="transform opacity-0 scale-95"
            enterTo="transform opacity-100 scale-100"
            leave="transition ease-in duration-75"
            leaveFrom="transform opacity-100 scale-100"
            leaveTo="transform opacity-0 scale-95"
          >
            <ListboxOptions className="absolute left-0 z-50 mt-1 max-h-60 w-80 overflow-auto rounded-md border border-stone-200 bg-stone-50 py-1 text-sm shadow-md ring-1 ring-stone-900 ring-opacity-5 focus:outline-none dark:border-stone-500 dark:bg-stone-700 dark:shadow-stone-800 dark:ring-stone-600">
              {options.map((option) => (
                <ListboxOption
                  key={option.id}
                  value={option.value}
                  className={({ focus }) =>
                    `relative cursor-default select-none py-2 pl-10 pr-4 ${
                      focus
                        ? "bg-amber-100 text-amber-900"
                        : "text-stone-900 dark:text-stone-300"
                    }`
                  }
                >
                  {({ selected: isSelected }) => (
                    <>
                      <span
                        className={`block truncate ${
                          isSelected ? "font-medium" : "font-normal"
                        }`}
                      >
                        {option.menuLabel}
                      </span>
                      {isSelected ? (
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-amber-600">
                          <CheckIcon className="h-5 w-5" aria-hidden="true" />
                        </span>
                      ) : null}
                    </>
                  )}
                </ListboxOption>
              ))}
            </ListboxOptions>
          </Transition>
        </div>
      </Listbox>
    </div>
  );
}
