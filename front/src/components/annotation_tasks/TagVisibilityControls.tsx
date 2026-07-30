import classNames from "classnames";

import type { TagVisibilityFilter } from "@/utils/passes";

const FILTER_OPTIONS: { key: keyof TagVisibilityFilter; label: string }[] = [
  { key: "species", label: "Species" },
  { key: "passes", label: "Passes" },
  { key: "type", label: "Type" },
];

export default function TagVisibilityControls({
  visibility,
  onChange,
}: {
  visibility: TagVisibilityFilter;
  onChange: (visibility: TagVisibilityFilter) => void;
}) {
  return (
    <div className="flex flex-row flex-wrap items-center gap-1">
      <span className="text-xs font-medium text-stone-500 dark:text-stone-400">
        Show tags:
      </span>
      {FILTER_OPTIONS.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          className={classNames(
            "rounded-md border px-2 py-0.5 text-xs font-medium transition-colors",
            visibility[key]
              ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "border-stone-300 bg-stone-100 text-stone-500 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-400",
          )}
          onClick={() =>
            onChange({
              ...visibility,
              [key]: !visibility[key],
            })
          }
        >
          {label}
        </button>
      ))}
    </div>
  );
}
