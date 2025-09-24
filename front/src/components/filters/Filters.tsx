import { useCallback, useState } from "react";

import Button from "@/components/Button";
import DatasetSearch from "@/components/datasets/DatasetSearch";
import { CheckIcon, CloseIcon } from "@/components/icons";
import Checkbox from "@/components/tables/TableCheckbox";
import TagSearchBar from "@/components/tags/TagSearchBar";
import { ACCEPT_SHORTCUT } from "@/utils/keyboard";

import type { Dataset, FloatEqFilter, NumberFilter, Tag } from "@/types";

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
}: {
  name: string;
  value: number;
  onChangeValue: (value: number) => void;
  onSubmit: () => void;
  operation: "gt" | "lt";
  onChangeOperation: (operation: "gt" | "lt") => void;
  showDecimals?: boolean;
}) {
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
          step={showDecimals ? "0.1" : undefined}
          id={name}
          name={name}
          className="block py-1 pr-14 pl-14 w-full rounded-md border-0 ring-1 ring-inset outline-none sm:text-sm sm:leading-6 focus:ring-2 focus:ring-inset focus:ring-emerald-600 bg-stone-50 text-stone-900 ring-stone-300 placeholder:text-stone-400 dark:bg-stone-900 dark:text-stone-300 dark:ring-stone-800"
          value={showDecimals ? value.toFixed(1) : value}
          onKeyDown={(e) => {
            if (e.key === ACCEPT_SHORTCUT) {
              onSubmit();
            }
          }}
          onChange={(e) => onChangeValue(parseFloat(e.target.value))}
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
  value,
  name,
  onChangeValue,
  onSubmit,
}: {
  name: string;
  value: number;
  onChangeValue: (value: number) => void;
  onSubmit: () => void;
}) {
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
          type="number"
          step={0.01}
          min={0}
          max={1.0}
          id={name}
          name={name}
          className="block py-1 pr-4 pl-4 w-full rounded-md border-0 ring-1 ring-inset outline-none sm:text-sm sm:leading-6 focus:ring-2 focus:ring-inset focus:ring-emerald-600 bg-stone-50 text-stone-900 ring-stone-300 placeholder:text-stone-400 dark:bg-stone-900 dark:text-stone-300 dark:ring-stone-800"
          value={value}
          onKeyDown={(e) => {
            if (e.key === ACCEPT_SHORTCUT) {
              onSubmit();
            }
          }}
          onChange={(e) => onChangeValue(parseFloat(e.target.value))}
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

export function FloatFilter({
  name = "field",
  onChange,
  showDecimals = false,
}: {
  name?: string;
  onChange: (filter: NumberFilter) => void;
  showDecimals?: boolean;
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
  const [value, setValue] = useState(0);

  const handleSubmit = useCallback(() => {
    onChange({
      "eq": value,
    });
  }, [onChange, value]);

  return (
    <div className="flex flex-col gap-2 w-full">
      <FloatEqField
        name={name}
        value={value}
        onChangeValue={setValue}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

export function NullableFloatFilter({
  name,
  onChange,
  showDecimals = false,
}: {
  name: string;
  onChange: (filter: NumberFilter) => void;
  showDecimals?: boolean;
}) {
  const [value, setValue] = useState(0);
  const [operation, setOperation] = useState<"gt" | "lt">("gt");
  const [isNull, setIsNull] = useState<boolean | null>(null);

  const handleSubmit = useCallback(() => {
    onChange({
      is_null: isNull || undefined,
      [operation]: value,
    });
  }, [onChange, isNull, operation, value]);

  return (
    <div className="flex relative flex-col gap-4 w-full">
      <FloatField
        name={name}
        value={value}
        onChangeValue={setValue}
        operation={operation}
        onChangeOperation={setOperation}
        onSubmit={handleSubmit}
        showDecimals={showDecimals}
      />
      <IsNullField
        name="is_null"
        value={isNull}
        onChange={setIsNull}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

export function BooleanFilter({
  onChange,
}: {
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex flex-row gap-2 justify-center w-full">
      <Button mode="text" variant="primary" onClick={() => onChange(true)}>
        <CheckIcon className="mr-1 w-5 h-5 group-hover:stroke-3" />
        Include
      </Button>
      <Button mode="text" variant="danger" onClick={() => onChange(false)}>
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

export function DatasetFilter({
  onChange,
}: {
  onChange: (dataset: Dataset) => void;
}) {
  return (
    <div className="flex flex-col gap-2 w-full">
      <DatasetSearch onSelect={(dataset) => onChange(dataset)} />
    </div>
  );
}
