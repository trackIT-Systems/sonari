import { Combobox, ComboboxOption, ComboboxOptions, ComboboxInput } from "@headlessui/react";
import Fuse from "fuse.js";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import Button from "@/components/Button";
import Search from "@/components/inputs/Search";

/** A search menu.
 * @component
 * Use this component when you have a list of options that you want to filter
 * using a search bar. The component will display a search bar and menu with
 * the search results. The menu is always visible.
 */
export default function SearchMenu<
  T extends {
    [key: string]: any;
  },
>({
  value,
  options,
  onSelect,
  renderOption,
  fields,
  getOptionKey = (_: T, index: number) => index,
  limit: initialLimit = 5,
  autoFocus = false,
  static: isStatic = true,
  displayValue,
  onChange,
  initialQuery = "",
  as = Search,
  empty,
}: {
  options: T[];
  renderOption: (option: T) => ReactNode;
  as?: any;
  value?: T;
  onSelect?: (selected: T) => void;
  getOptionKey?: (option: T, index: number) => string | number;
  limit?: number;
  autoFocus?: boolean;
  fields: string[];
  static?: boolean;
  displayValue?: (value: T) => string;
  onChange?: (value: string) => void;
  initialQuery?: string;
  empty?: ReactNode;
}) {
  const [limit, setLimit] = useState(initialLimit);
  const [query, setQuery] = useState(initialQuery);

  // Call onChange when the query changes.
  useEffect(() => onChange?.(query), [query, onChange]);

  const fuse = useMemo(
    () =>
      new Fuse(options, {
        keys: fields,
        threshold: 0.3,
      }),
    [options, fields],
  );

  const filteredOptions = useMemo(() => {
    if (!query) return options.slice(0, limit);
    return fuse.search(query, { limit }).map((result) => result.item);
  }, [query, fuse, options, limit]);

  const optionsClassName =
    "w-full rounded-md border bg-stone-50 dark:bg-stone-700 border-stone-200 dark:border-stone-600 py-2 px-1 overflow-auto shadow-lg focus:outline-none";

  if (isStatic) {
    return (
      <Combobox
        value={value}
        onChange={(value) => { if (value != null) onSelect?.(value); }}
      >
        {({ value, open }) => (
          <div className="relative">
            <ComboboxInput
              as={as}
              autoFocus={autoFocus}
              value={!open && value != null ? displayValue?.(value) : undefined}
              // @ts-ignore
              onChange={(value) => setQuery(value)}
            />
            <ComboboxOptions
              static={isStatic}
              className={`absolute mt-1 ${optionsClassName}`}
            >
              <MenuContents
                options={filteredOptions}
                total={options.length}
                limit={limit}
                initialLimit={initialLimit}
                renderOption={renderOption}
                getOptionKey={getOptionKey}
                setLimit={setLimit}
                empty={empty}
              />
            </ComboboxOptions>
          </div>
        )}
      </Combobox>
    );
  }

  return (
    <div className="flex flex-row w-full">
      <Combobox
        value={value}
        onChange={(value) => { if (value != null) onSelect?.(value); }}
      >
        <div className="relative w-full">
          <div className="w-full">
            <ComboboxInput
              as={as}
              autoFocus={autoFocus}
              value={value != null ? displayValue?.(value) : undefined}
              // @ts-ignore
              onChange={(value) => setQuery(value)}
            />
          </div>
          <ComboboxOptions className={`
            absolute top-full mt-2 z-10 ${optionsClassName}
            transition duration-200 ease-out
            data-[closed]:scale-95 data-[closed]:opacity-0
            data-[enter]:duration-200 data-[leave]:duration-150
            data-[enter]:ease-out data-[leave]:ease-in
          `}>
            <MenuContents
              options={filteredOptions}
              total={options.length}
              limit={limit}
              initialLimit={initialLimit}
              renderOption={renderOption}
              getOptionKey={getOptionKey}
              setLimit={setLimit}
              empty={empty}
            />
          </ComboboxOptions>
        </div>
      </Combobox>
    </div>
  );
}

function MenuOption<T>({
  option,
  renderOption,
}: {
  option: T;
  renderOption: (option: T) => ReactNode;
}) {
  return (
    <ComboboxOption
      className={({ focus }) =>
        `relative cursor-default select-none p-2 rounded-md ${focus
          ? "bg-stone-200 dark:bg-stone-800 text-emerald-600 dark:text-emerald-500"
          : ""
        }`
      }
      value={option}
    >
      {renderOption(option)}
    </ComboboxOption>
  );
}

function MenuContents<T>({
  options,
  total,
  limit,
  initialLimit,
  empty = "No options found",
  renderOption,
  getOptionKey,
  setLimit,
}: {
  options: T[];
  total: number;
  limit: number;
  initialLimit: number;
  empty?: ReactNode;
  renderOption: (option: T) => ReactNode;
  getOptionKey: (option: T, index: number) => string | number;
  setLimit: (limit: number) => void;
}) {
  return (
    <>
      {/* Render the options, up to the limit */}
      {options.map((option, index) => (
        <MenuOption
          key={getOptionKey(option, index)}
          option={option}
          renderOption={renderOption}
        />
      ))}
      {/* If there are more options than the limit, show a Show All button */}
      {options.length == limit && total > options.length ? (
        <Button
          mode="text"
          className="w-full cursor-default"
          onClick={() => setLimit(total)}
        >
          <div className="flex flex-row w-full justify-between items-center text-stone-500">
            <span className="flex-grow text-left">Show all</span>
            <span>{total - options.length} more</span>
          </div>
        </Button>
      ) : options.length > initialLimit ? (
        <Button
          mode="text"
          className="w-full cursor-default"
          onClick={() => setLimit(initialLimit)}
        >
          <div className="flex flex-row w-full justify-between items-center text-stone-500">
            <span className="flex-grow text-left">Show less</span>
          </div>
        </Button>
      ) : null}
      {total == 0 && (empty || null)}
    </>
  );
}
