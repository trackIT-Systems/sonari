import { useMemo, useCallback, memo } from "react";
import classNames from "classnames";

import { CloseIcon, FilterIcon } from "@/components/icons";
import Tooltip from "@/components/Tooltip";
import {
  formatActiveFilterSummary,
  joinFilterSummary,
} from "@/components/filters/formatActiveFilterSummary";

import type { FilterDef } from "@/components/filters/FilterMenu";
import type { Filter } from "@/hooks/utils/useFilter";

// Memoized component to prevent unnecessary re-renders of filter items
function FilterItem<T extends Object>({
  filterDef,
  value,
  onClear,
  onSetFilter,
}: {
  filterDef: FilterDef<T>;
  value: any;
  onClear: () => void;
  onSetFilter: (key: keyof T, value: any) => void;
}) {
  return filterDef.render({
    value,
    clear: onClear,
    setFilter: onSetFilter,
  });
}

export default function FilterBar<T extends Object>({
  filter,
  filterDef,
  total,
  showIfEmpty = false,
  withLabel = true,
  compactSummary = false,
  className,
}: {
  filter: Filter<T>;
  filterDef: FilterDef<T>[];
  total?: number;
  showIfEmpty?: boolean;
  withLabel?: boolean;
  /** One truncating chip with full filter text on hover */
  compactSummary?: boolean;
  className?: string;
}) {
  const activeFilters = Object.keys(filter.filter).filter(
    (key) => !filter.isFixed(key as keyof T),
  ).length;

  const filterDefMapping = useMemo(() => {
    const mapping: Record<string, FilterDef<T>> = {};
    for (const def of filterDef) {
      mapping[def.field as string] = def;
    }
    return mapping;
  }, [filterDef]);

  const summaryLines = useMemo(
    () => formatActiveFilterSummary(filter, filterDef),
    [filter, filterDef],
  );

  const clearAllFilters = useCallback(() => {
    for (const key of Object.keys(filter.filter)) {
      const field = key as keyof T;
      if (!filter.isFixed(field)) {
        filter.clear(field);
      }
    }
  }, [filter]);

  if (activeFilters === 0 && !showIfEmpty) {
    return null;
  }

  if (compactSummary && summaryLines.length > 0) {
    const fullText = joinFilterSummary(summaryLines, "\n");
    const inlineText = joinFilterSummary(summaryLines);

    return (
      <div className={classNames("min-w-0 max-w-full shrink overflow-hidden", className)}>
        <Tooltip
          portal
          placement="bottom-start"
          tooltip={
            <div className="max-w-md whitespace-pre-wrap text-sm">{fullText}</div>
          }
        >
          <span
            className="inline-flex w-fit max-w-md min-w-0 items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-600 ring-1 ring-inset ring-blue-500/10"
          >
            <FilterIcon className="h-3.5 w-3.5 shrink-0 text-blue-600" />
            <span className="min-w-0 truncate">{inlineText}</span>
            <button
              type="button"
              className="ml-1 shrink-0 rounded p-1 hover:bg-blue-200"
              aria-label="Clear all filters"
              onClick={(event) => {
                event.stopPropagation();
                clearAllFilters();
              }}
            >
              <CloseIcon className="h-3 w-3" />
            </button>
          </span>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
      {total != null && (
        <span className="mr-3 text-stone-500">{total} results</span>
      )}
      <div className="flex flex-row flex-wrap items-center gap-2">
        {withLabel && (
          <span className="mr-2 text-blue-200">
            <FilterIcon className="inline-block h-5 w-5 mr-1" />
            Filters:
          </span>
        )}
        {Object.entries(filter.filter)
          .filter(([key, _]) => !filter.isFixed(key as keyof T))
          .filter(([key, _]) => key in filterDefMapping)
          .map(([key, value]) => {
            const filterDef = filterDefMapping[key];
            const handleClear = () => filter.clear(key as keyof T);
            return (
              <div key={key}>
                <FilterItem
                  filterDef={filterDef}
                  value={value}
                  onClear={handleClear}
                  onSetFilter={filter.set}
                />
              </div>
            );
          })}
      </div>
    </div>
  );
}
