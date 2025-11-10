import { useMemo, useCallback, memo } from "react";

import {  FilterIcon } from "@/components/icons";

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
}: {
  filter: Filter<T>;
  filterDef: FilterDef<T>[];
  total?: number;
  showIfEmpty?: boolean;
  withLabel?: boolean;
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

  if (activeFilters === 0 && !showIfEmpty) {
    return null;
  }

  return (
    <div className="flex flex-row items-center">
      {total != null && (
        <span className="mr-3 text-stone-500">{total} results</span>
      )}
      <div className="flex flex-row items-center space-x-2">
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
