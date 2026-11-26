import { useCallback, useState } from "react";

import Button from "@/components/Button";
import { CheckIcon, CloseIcon } from "@/components/icons";
import Checkbox from "@/components/tables/TableCheckbox";
import TagSearchBar from "@/components/tags/TagSearchBar";
import { ACCEPT_SHORTCUT } from "@/utils/keyboard";

import type { FloatEqFilter, NumberFilter, Tag } from "@/types";

export type SetFilter<T extends Object> = <K extends keyof T>(
  key: K,
  value: T[K],
) => void;

function FloatField({
  operation,
  onChangeOperation,
  value,
  name,
  onChangeValue,
  onSubmit,
  showDecimals = false,
  min,
  max,
  step,
}: {
  name: string;
  value: number;
  onChangeValue: (value: number) => void;
  onSubmit: () => void;
  operation: "gt" | "lt";
  onChangeOperation: (operation: "gt" | "lt") => void;
  showDecimals?: boolean;
  min?: number;
  max?: number;
  step?: number;
}) {
  const [inputValue, setInputValue] = useState("");
  
  return (
    <div>
      <label
        htmlFor={name}
        className="block mb-2 text-sm font-medium leading-6 text-gray-700 dark:text-stone-300"
      >
        {name}
      </label>
      <div className="relative rounded-md">
        <div className="flex absolute inset-y-0 left-0 items-center">
          <label htmlFor={`${name}-operation`} className="sr-only">
            Operation
          </label>
          <select
            className="pr-3 pl-2 h-full bg-transparent rounded-l-md border-0 focus:ring-2 focus:ring-inset focus:ring-emerald-600 text-stone-500"
            id={`${name}-operation`}
            name={`${name}-operation`}
            value={operation}
            onChange={(e) => onChangeOperation(e.target.value as "lt" | "gt")}
          >
            <option value="gt">&gt;</option>
            <option value="lt">&lt;</option>
          </select>
        </div>
        <input
          type="number"
          step={step}
          min={min}
          max={max}
          id={name}
          name={name}
          placeholder={step !== undefined && step < 0.1 ? "0.00" : (showDecimals ? "0.0" : "0")}
          className="block py-1 pr-14 pl-14 w-full rounded-md border-0 ring-1 ring-inset outline-none sm:text-sm sm:leading-6 focus:ring-2 focus:ring-inset focus:ring-emerald-600 bg-stone-50 text-stone-900 ring-stone-300 placeholder:text-stone-400 dark:bg-stone-900 dark:text-stone-300 dark:ring-stone-800"
          value={inputValue}
          onKeyDown={(e) => {
            if (e.key === ACCEPT_SHORTCUT) {
              onSubmit();
            }
          }}
          onChange={(e) => {
            const rawValue = e.target.value;
            
            let newValue = parseFloat(rawValue);
            if (isNaN(newValue)) {
              newValue = 0;
            }
            // Clamp value between min and max if they're defined
            let wasClamped = false;
            if (min !== undefined && newValue < min) {
              newValue = min;
              wasClamped = true;
            }
            if (max !== undefined && newValue > max) {
              newValue = max;
              wasClamped = true;
            }
            
            // Update input to show clamped value or raw input
            setInputValue(wasClamped ? String(newValue) : rawValue);
            onChangeValue(newValue);
          }}
        />
        <button
          onClick={onSubmit}
          className="inline-block absolute inset-y-0 right-0 px-2 text-emerald-700 bg-emerald-300 rounded-r-md dark:text-emerald-300 dark:bg-emerald-700 dark:hover:bg-emerald-800 dark:hover:text-emerald-400"
        >
          set
        </button>
      </div>
    </div>
  );
}

function FloatEqField({
  name,
  onChangeValue,
  onSubmit,
}: {
  name: string;
  onChangeValue: (value: number) => void;
  onSubmit: () => void;
}) {
  // Keep the typed string so values like "0." and "0.1" are not rounded back to 0.
  const [inputValue, setInputValue] = useState("");

  return (
    <div>
      <label
        htmlFor={name}
        className="block mb-2 text-sm font-medium leading-6 text-gray-700 dark:text-stone-300"
      >
        {name}
      </label>
      <div className="relative rounded-md">
        <input
          type="text"
          inputMode="decimal"
          id={name}
          name={name}
          placeholder="0.10"
          className="block py-1 pr-14 pl-4 w-full rounded-md border-0 ring-1 ring-inset outline-none sm:text-sm sm:leading-6 focus:ring-2 focus:ring-inset focus:ring-emerald-600 bg-stone-50 text-stone-900 ring-stone-300 placeholder:text-stone-400 dark:bg-stone-900 dark:text-stone-300 dark:ring-stone-800"
          value={inputValue}
          onKeyDown={(e) => {
            if (e.key === ACCEPT_SHORTCUT) {
              onSubmit();
            }
          }}
          onChange={(e) => {
            const rawValue = e.target.value;
            if (rawValue !== "" && !/^\d*\.?\d*$/.test(rawValue)) {
              return;
            }
            setInputValue(rawValue);

            const parsed = parseFloat(rawValue);
            if (Number.isNaN(parsed)) {
              return;
            }

            const clamped = Math.min(1, Math.max(0, parsed));
            if (clamped !== parsed) {
              setInputValue(String(clamped));
            }
            onChangeValue(clamped);
          }}
        />
        <button
          onClick={onSubmit}
          className="inline-block absolute inset-y-0 right-0 px-2 text-emerald-700 bg-emerald-300 rounded-r-md dark:text-emerald-300 dark:bg-emerald-700 dark:hover:bg-emerald-800 dark:hover:text-emerald-400"
        >
          Set
        </button>
      </div>
    </div>
  );
}

function IsNullField({
  name,
  value,
  onChange,
  onSubmit,
}: {
  name: string;
  value: boolean | null;
  onChange: (value: boolean | null) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="flex flex-row items-center space-x-2">
      <label
        htmlFor={`${name}-isnull`}
        className="text-sm font-medium text-stone-700 dark:text-stone-300"
      >
        Is null?
      </label>
      <Checkbox
        id={`${name}-isnull`}
        className="text-emerald-500 rounded shadow-sm dark:text-emerald-500 focus:ring focus:ring-emerald-300 focus:ring-opacity-50 focus:ring-offset-0 form-checkbox"
        checked={value === true}
        indeterminate={value === false}
        onChange={() => {
          if (value === null) {
            onChange(false);
          } else if (value === false) {
            onChange(true);
          } else {
            onChange(null);
          }
        }}
      />
      <span className="text-stone-500">
        {value === null ? "not set" : value ? "is null" : "is not null"}
      </span>
      <button
        onClick={onSubmit}
        disabled={value === null}
        className="absolute right-0 py-1 px-2 text-emerald-700 bg-emerald-300 rounded-md dark:text-emerald-300 dark:bg-emerald-700 disabled:text-emerald-600 disabled:bg-emerald-300 dark:hover:bg-emerald-800 dark:hover:text-emerald-400 dark:disabled:bg-emerald-900 dark:disabled:text-emerald-600"
      >
        set
      </button>
    </div>
  );
}

export type IntegerCountFilter = {
  eq?: number;
  gt?: number;
  lt?: number;
  ge?: number;
  le?: number;
};

type CountOperation = "eq" | "gt" | "ge" | "lt" | "le";
type BoundOperation = Exclude<CountOperation, "eq">;

const OPERATION_LABELS: Record<CountOperation, string> = {
  eq: "=",
  gt: ">",
  ge: ">=",
  lt: "<",
  le: "<=",
};

/** The operations a second bound can take: the other direction than the first */
function secondOperations(first: CountOperation): BoundOperation[] {
  if (first === "gt" || first === "ge") return ["lt", "le"];
  if (first === "lt" || first === "le") return ["gt", "ge"];
  return [];
}

/** The amounts a count filter lets through, or null when there is no bound */
export function integerCountMatches(filter: IntegerCountFilter): { min: number; max: number } | null {
  let min = 0;
  let max = Infinity;
  if (filter.eq !== undefined) {
    min = Math.max(min, filter.eq);
    max = Math.min(max, filter.eq);
  }
  if (filter.gt !== undefined) min = Math.max(min, filter.gt + 1);
  if (filter.ge !== undefined) min = Math.max(min, filter.ge);
  if (filter.lt !== undefined) max = Math.min(max, filter.lt - 1);
  if (filter.le !== undefined) max = Math.min(max, filter.le);
  return { min, max };
}

/** The first and (optional) second term of a count filter, to edit it */
function splitCountFilter(filter: IntegerCountFilter | undefined): {
  first: { operation: CountOperation; value: string };
  second: { operation: BoundOperation; value: string } | null;
} {
  if (filter?.eq !== undefined) return { first: { operation: "eq", value: String(filter.eq) }, second: null };
  const lowerOperation: BoundOperation | null =
    filter?.gt !== undefined ? "gt" : filter?.ge !== undefined ? "ge" : null;
  const upperOperation: BoundOperation | null =
    filter?.lt !== undefined ? "lt" : filter?.le !== undefined ? "le" : null;
  const term = (operation: BoundOperation) => ({ operation, value: String(filter![operation]) });
  if (lowerOperation && upperOperation) return { first: term(lowerOperation), second: term(upperOperation) };
  if (lowerOperation) return { first: term(lowerOperation), second: null };
  if (upperOperation) return { first: term(upperOperation), second: null };
  return { first: { operation: "eq", value: "1" }, second: null };
}

/**
 * An amount: = n, or one bound (> >= < <=), optionally with a second bound
 * in the other direction for a range, e.g. > 2 and < 5.
 */
export function IntegerFilter({
  name = "Tag count",
  value: current,
  onChange,
  min = 0,
}: {
  name?: string;
  /** The amount filter set so far; the fields start from it */
  value?: IntegerCountFilter;
  onChange: (filter: IntegerCountFilter | undefined) => void;
  min?: number;
}) {
  const initial = splitCountFilter(current);
  const [first, setFirst] = useState(initial.first);
  const [second, setSecond] = useState(initial.second);

  const allowedSecond = secondOperations(first.operation);
  // A second bound only goes with a first bound of the other direction
  const shownSecond = second != null && allowedSecond.includes(second.operation) ? second : null;

  const build = (): IntegerCountFilter | undefined => {
    const filter: IntegerCountFilter = {};
    const firstValue = parseInt(first.value, 10);
    if (!Number.isNaN(firstValue)) filter[first.operation] = Math.max(min, firstValue);
    if (shownSecond != null) {
      const secondValue = parseInt(shownSecond.value, 10);
      if (!Number.isNaN(secondValue)) filter[shownSecond.operation] = Math.max(min, secondValue);
    }
    return Object.keys(filter).length > 0 ? filter : undefined;
  };

  const built = build();
  const range = built ? integerCountMatches(built) : null;
  const isEmpty = range != null && range.min > range.max;

  const handleSubmit = () => {
    if (isEmpty || built == null) return;
    onChange(built);
  };

  const fieldClass =
    "rounded-md border border-stone-300 bg-stone-50 px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-900";
  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === ACCEPT_SHORTCUT) handleSubmit();
  };

  return (
    <div className="flex flex-col gap-2 w-full">
      <span className="block text-sm font-medium text-stone-700 dark:text-stone-300">{name}</span>
      <div className="flex flex-row flex-wrap items-center gap-2">
        <select
          aria-label={`${name}: operation`}
          className={fieldClass}
          value={first.operation}
          onChange={(e) => {
            const operation = e.target.value as CountOperation;
            setFirst((prev) => ({ ...prev, operation }));
            // Keep a second bound only if it still points the other way
            setSecond((prev) => {
              if (prev == null) return prev;
              const allowed = secondOperations(operation);
              if (allowed.length === 0) return null;
              return allowed.includes(prev.operation) ? prev : { ...prev, operation: allowed[0] };
            });
          }}
        >
          {(Object.keys(OPERATION_LABELS) as CountOperation[]).map((operation) => (
            <option key={operation} value={operation}>
              {OPERATION_LABELS[operation]}
            </option>
          ))}
        </select>
        <input
          aria-label={`${name}: value`}
          type="number"
          min={min}
          step={1}
          className={`${fieldClass} w-16`}
          value={first.value}
          onKeyDown={onEnter}
          onChange={(e) => {
            const value = e.target.value;
            setFirst((prev) => ({ ...prev, value }));
          }}
        />
        {shownSecond != null ? (
          <>
            <span className="text-sm text-stone-500">and</span>
            <select
              aria-label={`${name}: second operation`}
              className={fieldClass}
              value={shownSecond.operation}
              onChange={(e) => {
                const operation = e.target.value as BoundOperation;
                setSecond((prev) => (prev == null ? prev : { ...prev, operation }));
              }}
            >
              {allowedSecond.map((operation) => (
                <option key={operation} value={operation}>
                  {OPERATION_LABELS[operation]}
                </option>
              ))}
            </select>
            <input
              aria-label={`${name}: second value`}
              type="number"
              min={min}
              step={1}
              className={`${fieldClass} w-16`}
              value={shownSecond.value}
              onKeyDown={onEnter}
              onChange={(e) => {
                const value = e.target.value;
                setSecond((prev) => (prev == null ? prev : { ...prev, value }));
              }}
            />
            <button
              type="button"
              aria-label={`${name}: remove second bound`}
              onClick={() => setSecond(null)}
              className="rounded-md p-1 text-stone-500 hover:text-red-600"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </>
        ) : (
          allowedSecond.length > 0 && (
            <button
              type="button"
              onClick={() => setSecond({ operation: allowedSecond[0], value: "" })}
              className="text-sm text-emerald-600 hover:underline dark:text-emerald-400"
            >
              + and {OPERATION_LABELS[allowedSecond[0]]} …
            </button>
          )
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isEmpty || built == null}
          className="rounded-md bg-emerald-300 px-3 py-1 text-sm text-emerald-800 disabled:opacity-50 dark:bg-emerald-700 dark:text-emerald-200"
        >
          set
        </button>
      </div>
      {isEmpty && (
        <p className="text-xs text-red-600 dark:text-red-400">No amount fits both bounds.</p>
      )}
    </div>
  );
}

export function FloatFilter({
  name = "field",
  onChange,
  showDecimals = false,
  min,
  max,
  step,
}: {
  name?: string;
  onChange: (filter: NumberFilter) => void;
  showDecimals?: boolean;
  min?: number;
  max?: number;
  step?: number;
}) {
  const [value, setValue] = useState(0.0);
  const [operation, setOperation] = useState<"gt" | "lt">("gt");

  const handleSubmit = useCallback(() => {
    onChange({
      [operation]: value,
    });
  }, [onChange, operation, value]);

  return (
    <div className="flex flex-col gap-2 w-full">
      <FloatField
        name={name}
        value={value}
        onChangeValue={setValue}
        operation={operation}
        onChangeOperation={setOperation}
        onSubmit={handleSubmit}
        showDecimals={showDecimals}
        min={min}
        max={max}
        step={step}
      />
    </div>
  );
}

export function FloatEqFilterFn({
  name,
  onChange,
}: {
  name: string;
  onChange: (filter: FloatEqFilter) => void;
}) {
  const [value, setValue] = useState<number | null>(null);

  const handleSubmit = useCallback(() => {
    if (value == null || Number.isNaN(value)) {
      return;
    }
    onChange({
      eq: value,
    });
  }, [onChange, value]);

  return (
    <div className="flex flex-col gap-2 w-full">
      <FloatEqField
        name={name}
        onChangeValue={setValue}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

export function IncludeTagMatchFilter({
  value,
  onChange,
}: {
  value: "and" | "or";
  onChange: (value: "and" | "or") => void;
}) {
  return (
    <div className="flex flex-row gap-2 justify-center w-full">
      <Button
        mode={value === "or" ? "outline" : "text"}
        variant="secondary"
        onClick={() => onChange("or")}
        className="flex-1 justify-center"
      >
        OR
      </Button>
      <Button
        mode={value === "and" ? "outline" : "text"}
        variant="secondary"
        onClick={() => onChange("and")}
        className="flex-1 justify-center"
      >
        AND
      </Button>
    </div>
  );
}

export function BooleanFilter({
  onChange,
  value,
}: {
  onChange: (value: boolean) => void;
  /** When set, the active choice uses an outline (Include = true, Exclude = false). */
  value?: boolean;
}) {
  return (
    <div className="flex flex-row gap-2 justify-center w-full">
      <Button
        mode={value === true ? "outline" : "text"}
        variant="primary"
        onClick={() => onChange(true)}
        className="flex-1 justify-center"
      >
        <CheckIcon className="mr-1 w-5 h-5 group-hover:stroke-3" />
        Include
      </Button>
      <Button
        mode={value === false ? "outline" : "text"}
        variant="danger"
        onClick={() => onChange(false)}
        className="flex-1 justify-center"
      >
        <CloseIcon className="mr-1 w-5 h-5 group-hover:stroke-3" />
        Exclude
      </Button>
    </div>
  );
}

export function TagFilter({ onChange }: { onChange: (tag: Tag) => void }) {
  return (
    <div className="flex flex-col gap-2 w-full">
      <TagSearchBar onSelect={(tag) => onChange(tag)} />
    </div>
  );
}

export function TextFilter({
  name = "Search",
  placeholder = "Type to search...",
  onChange,
}: {
  name?: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const [value, setValue] = useState("");

  const handleSubmit = useCallback(() => {
    if (value.trim()) {
      onChange(value.trim());
    }
  }, [onChange, value]);

  return (
    <div>
      <label
        htmlFor={name}
        className="block mb-2 text-sm font-medium leading-6 text-gray-700 dark:text-stone-300"
      >
        {name}
      </label>
      <div className="relative rounded-md">
        <input
          type="text"
          id={name}
          name={name}
          placeholder={placeholder}
          className="block py-1 pr-14 pl-4 w-full rounded-md border-0 ring-1 ring-inset outline-none sm:text-sm sm:leading-6 focus:ring-2 focus:ring-inset focus:ring-emerald-600 bg-stone-50 text-stone-900 ring-stone-300 placeholder:text-stone-400 dark:bg-stone-900 dark:text-stone-300 dark:ring-stone-800"
          value={value}
          onKeyDown={(e) => {
            if (e.key === ACCEPT_SHORTCUT) {
              handleSubmit();
            }
          }}
          onChange={(e) => setValue(e.target.value)}
        />
        <button
          onClick={handleSubmit}
          className="inline-block absolute inset-y-0 right-0 px-2 text-emerald-700 bg-emerald-300 rounded-r-md dark:text-emerald-300 dark:bg-emerald-700 dark:hover:bg-emerald-800 dark:hover:text-emerald-400"
        >
          set
        </button>
      </div>
    </div>
  );
}
