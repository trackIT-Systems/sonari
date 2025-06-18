import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import { type ReactNode, useState, useRef } from "react";

import Button, { getButtonClassName } from "@/components/Button";
import { BackIcon, FilterIcon } from "@/components/icons";
import SearchMenu from "@/components/search/SearchMenu";

import type { SetFilter } from "@/components/filters/Filters";
import type { Filter } from "@/hooks/utils/useFilter";
import { ABORT_SHORTCUT } from "@/utils/keyboard";
import { useKeyPressEvent } from "react-use";
import useKeyFilter from "@/hooks/utils/useKeyFilter";

export type FilterDef<T extends Object> = {
  field: keyof T;
  name: string;
  description?: string;
  icon?: ReactNode;
  selector: ({
    setFilter,
    filter
  }: {
    setFilter: SetFilter<T>;
    filter: Filter<T>;
  }) => ReactNode;
  render: (renderProps: {
    value: any;
    clear: () => void;
    setFilter: SetFilter<T>;
  }) => ReactNode;
};

function FilterCombobox<T extends Object>({
  filterDefs,
  onChange,
}: {
  filterDefs: FilterDef<T>[];
  onChange?: (filter: FilterDef<T>) => void;
}) {
  return (
    <>
      <div className="mb-2 text-stone-700 dark:text-stone-300 underline underline-offset-2 decoration-amber-500 decoration-2">
        Apply Filter
      </div>
      <SearchMenu
        options={filterDefs}
        static={true}
        renderOption={(filter) => (
          <>
            {filter.icon ?? filter.icon}
            {filter.name}
          </>
        )}
        limit={100}
        fields={["name", "prefix"]}
        getOptionKey={(filter) => filter.name}
        onSelect={onChange}
        empty={
          <div className="text-stone-500 text-center w-full">
            No filters found
          </div>
        }
        autoFocus
      />
    </>
  );
}

function FilterPanel<T extends Object>({
  filter,
  filterDefs,
}: {
  filter: Filter<T>;
  filterDefs: FilterDef<T>[];
}) {
  const [selectedFilter, setSelectedFilter] = useState<FilterDef<T> | null>(null);

  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useKeyPressEvent(useKeyFilter({ key: ABORT_SHORTCUT }), (event: KeyboardEvent) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }
    const button = cancelButtonRef.current;
    if (button instanceof HTMLButtonElement) {
      button.click();
    }
  });

  if (selectedFilter == null) {
    return (
      <FilterCombobox
        filterDefs={filterDefs}
        onChange={(filter) => setSelectedFilter(filter)}
      />
    );
  }

  return (
    <>
      <div className="mb-2 flex flex-row items-center justify-between">
        <div>
          <span className="text-stone-500 mr-2">Filter by</span>
          <span className="text-stone-700 dark:text-stone-300 underline underline-offset-2 decoration-amber-500 decoration-2">
            {selectedFilter.name}
          </span>
        </div>
        <Button
          ref={cancelButtonRef}
          mode="text"
          variant="warning"
          onClick={() => setSelectedFilter(null)}
        >
          <BackIcon className="w-5 h-5 group-hover:stroke-3" />
        </Button>
      </div>
      {selectedFilter.description != null ? (
        <div className="mb-4">
          <span className="text-sm dark:text-stone-400 text-stone-600">
            {selectedFilter.description}
          </span>
        </div>
      ) : null}
      <div className="flex flex-row space-x-2">
        {selectedFilter.selector({
          setFilter: (name, value) => {
            filter.set(name, value);
            setSelectedFilter(null);
          },
          filter  // Pass the filter prop
        })}
      </div>
    </>
  );
}

export default function FilterPopover<T extends Object>({
  filter,
  filterDef,
  button,
  mode = "filled",
  variant = "primary",
  className,
}: {
  filter: Filter<T>;
  filterDef: FilterDef<T>[];
  button?: ReactNode;
  mode?: "filled" | "outline" | "text";
  variant?: "primary" | "secondary" | "danger" | "success" | "warning" | "info";
  className?: string;
}) {
  if (className == null) {
    className = getButtonClassName({ mode, variant });
  }

  return (
    <Popover as="div" className="relative inline-block text-left">
      {button != null ? (
        <PopoverButton as="div">
          {button}
        </PopoverButton>
      ) : (
        <PopoverButton as="div" className={className}>
          <FilterIcon className="h-4 w-4 stroke-2" />
        </PopoverButton>
      )}
      <PopoverPanel
        unmount
        className="absolute right-0 mt-1 w-96 divide-y divide-stone-100 rounded-md bg-stone-50 dark:bg-stone-700 border border-stone-200 dark:border-stone-500 shadow-md dark:shadow-stone-800 ring-1 ring-stone-900 ring-opacity-5 focus:outline-none z-50 origin-top-right transition transform data-[closed]:scale-95 data-[closed]:opacity-0 data-[enter]:duration-100 data-[leave]:duration-75 data-[enter]:ease-out data-[leave]:ease-in"
      >
        <div className="p-4">
          <FilterPanel filter={filter} filterDefs={filterDef} />
        </div>
      </PopoverPanel>
    </Popover>
  );
}