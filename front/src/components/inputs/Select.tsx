import { Listbox, ListboxButton, ListboxOption, ListboxOptions, Label} from "@headlessui/react";
import { type ReactNode, RefObject } from "react";

import { CheckIcon, ExpandIcon } from "@/components/icons";
import {
  BACKGROUND_STYLE,
  BORDER_STYLE,
  COMMON_STYLE,
  DISABLED_STYLE,
  FOCUS_STYLE,
  TEXT_STYLE,
} from "./styles";

export type Option<T> = {
  id: string | number;
  label: ReactNode;
  value: T;
  disabled?: boolean;
};

export default function Select<T>({
  label,
  selected,
  onChange,
  options,
  placement = "top-end",
  buttonRef,
  disabled = false,
}: {
  label?: string;
  selected: Option<T>;
  onChange: (value: T) => void;
  options: Option<T>[];
  placement?:
  | "top-end"
  | "top-start"
  | "bottom-end"
  | "bottom-start"
  | "bottom";
  buttonRef?: RefObject<HTMLButtonElement>;
  disabled?: boolean;
}) {
  // Generate positioning classes based on placement
  const getPositionClasses = (placement: string) => {
    switch (placement) {
      case "top-end":
        return "bottom-full right-0 mb-1";
      case "top-start":
        return "bottom-full left-0 mb-1";
      case "bottom-end":
        return "top-full right-0 mt-1";
      case "bottom-start":
        return "top-full left-0 mt-1";
      case "bottom":
        return "top-full left-1/2 -translate-x-1/2 mt-1";
      default:
        return "bottom-full right-0 mb-1";
    }
  };

  return (
    <Listbox value={selected.value} onChange={onChange} disabled={disabled}>
      <div className={`relative ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}>
        <div className="inline-flex gap-2 w-full">
          {label ? (
            <div className="my-auto inline-block">
              <Label className="text-sm text-stone-500 dark:text-stone-400 whitespace-nowrap">
                {label}
              </Label>
            </div>
          ) : null}
          <ListboxButton
            ref={buttonRef}
            className={`${COMMON_STYLE} ${BORDER_STYLE} ${BACKGROUND_STYLE} ${TEXT_STYLE} ${FOCUS_STYLE} ${DISABLED_STYLE} w-full border pl-3 pr-10 text-left relative ${disabled ? "cursor-not-allowed" : "cursor-default"}`}
          >
            <span className="block truncate">{selected.label}</span>
            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
              <ExpandIcon
                className="h-5 w-5 text-stone-400"
                aria-hidden="true"
              />
            </span>
          </ListboxButton>
        </div>
        <ListboxOptions className={`
          absolute z-10 ${getPositionClasses(placement)}
          max-h-60 w-full overflow-auto rounded-lg bg-stone-50 dark:bg-stone-700 py-1 text-base shadow-lg ring-1 ring-stone-900 dark:ring-stone-600 ring-opacity-5 focus:outline-none sm:text-sm
          transition ease-in duration-100 data-[closed]:opacity-0
        `}>
          {options.map((option) => (
            <ListboxOption
              key={option.id}
              value={option.value}
              className={({ focus }) =>
                `relative cursor-default select-none py-2 pl-10 pr-4 ${focus
                  ? "bg-amber-100 text-amber-900"
                  : "text-stone-900 dark:text-stone-400"
                }`
              }
            >
              {({ selected }) => (
                <>
                  <span
                    className={`block truncate ${selected ? "font-medium" : "font-normal"
                      }`}
                  >
                    {option.label}
                  </span>
                  {selected ? (
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-amber-600">
                      <CheckIcon className="h-5 w-5" aria-hidden="true" />
                    </span>
                  ) : null}
                </>
              )}
            </ListboxOption>
          ))}
        </ListboxOptions>
      </div>
    </Listbox>
  );
}