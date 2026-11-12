import classNames from "classnames";
import { useEffect, useRef } from "react";

import type { NightGroup } from "@/hooks/api/useAnnotationTaskNights";

export type NightTickState = "none" | "some" | "all";

const dateFormat = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", timeZone: "UTC" });

/** "Sat, 14 Jun 2026 → Sun 15" for the night starting on the evening of 2026-06-14 */
export function formatNight(night: string | null): string {
  if (night == null) return "No recording date";
  const evening = new Date(`${night}T00:00:00Z`);
  if (Number.isNaN(evening.getTime())) return night;
  const morning = new Date(evening.getTime() + 24 * 3600 * 1000);
  return `${dateFormat.format(evening)} → ${dayFormat.format(morning)}`;
}

/**
 * Full-width table row heading one night of tasks: tick the whole night,
 * expand or collapse it, and see how far it is annotated.
 */
export default function NightHeaderRow({
  group,
  colSpan,
  current,
  narrowed,
  tickState,
  onToggleExpanded,
  onToggleTick,
}: {
  group: NightGroup;
  colSpan: number;
  /** The filter narrows the night's tasks: say how many of them match */
  narrowed: boolean;
  /** The cursor is on this header */
  current: boolean;
  tickState: NightTickState;
  onToggleExpanded: () => void;
  onToggleTick: () => void;
}) {
  const checkboxRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (checkboxRef.current) checkboxRef.current.indeterminate = tickState === "some";
  }, [tickState]);

  const { stats } = group;
  const donePercent = stats && stats.total > 0 ? Math.round((100 * stats.done_count) / stats.total) : 0;
  const tasks = (count: number) => `${count} ${count === 1 ? "task" : "tasks"}`;

  return (
    <tr
      data-night-key={group.key}
      aria-expanded={group.empty ? undefined : group.expanded}
      aria-disabled={group.empty || undefined}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("input, label")) return;
        onToggleExpanded();
      }}
      className={classNames(
        "select-none border-y border-stone-300 dark:border-stone-600",
        group.empty ? "cursor-default opacity-60" : "cursor-pointer",
        current
          ? "bg-emerald-100 dark:bg-emerald-900/40"
          : classNames(
            "bg-stone-100 dark:bg-stone-800",
            !group.empty && "hover:bg-stone-200 dark:hover:bg-stone-700",
          ),
      )}
    >
      <td colSpan={colSpan} className="px-2 py-1.5">
        <div className="flex min-w-0 flex-row items-center gap-3 text-sm">
          <input
            ref={checkboxRef}
            type="checkbox"
            aria-label={`Tick all tasks of ${formatNight(group.night)}`}
            checked={tickState === "all"}
            disabled={group.empty}
            // Don't keep the focus: a focused checkbox blocks the table's shortcuts
            onMouseDown={(event) => event.preventDefault()}
            onChange={onToggleTick}
            className="h-4 w-4 shrink-0"
          />
          <span
            aria-hidden
            className={classNames(
              "inline-block w-3 shrink-0 text-stone-500 transition-transform",
              group.expanded && "rotate-90",
              group.empty && "invisible",
            )}
          >
            ▶
          </span>
          <span className="shrink-0 font-semibold text-stone-800 dark:text-stone-200">
            {formatNight(group.night)}
          </span>
          <span className="shrink-0 tabular-nums text-stone-600 dark:text-stone-400">
            {!narrowed
              ? tasks(group.total)
              : stats
                ? `${stats.total} of ${tasks(group.total)} match`
                : tasks(group.total)}
          </span>
          {stats == null ? (
            <span className="text-xs text-stone-500 dark:text-stone-400">Counting…</span>
          ) : stats.total > 0 && (
            <span className="flex shrink-0 items-center gap-2 tabular-nums text-xs text-stone-500 dark:text-stone-400">
              <span
                className="relative h-1.5 w-20 overflow-hidden rounded-full bg-stone-300 dark:bg-stone-600"
                role="progressbar"
                aria-label="Done"
                aria-valuenow={donePercent}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span
                  className="absolute inset-y-0 left-0 rounded-full bg-emerald-500"
                  style={{ width: `${donePercent}%` }}
                />
              </span>
              <span>{stats.done_count} done</span>
              <span>· {stats.pending_count} pending</span>
              {stats.verified_count > 0 && <span>· {stats.verified_count} verified</span>}
              {stats.rejected_count > 0 && <span>· {stats.rejected_count} rejected</span>}
              {stats.assigned_count > 0 && <span>· {stats.assigned_count} unsure</span>}
            </span>
          )}
          {group.isLoadingTasks && <span className="text-xs text-stone-500">Loading…</span>}
        </div>
      </td>
    </tr>
  );
}

/** Row under a night's loaded tasks when more remain: loads the next ones */
export function NightMoreRow({
  group,
  colSpan,
  onLoadMore,
}: {
  group: NightGroup;
  colSpan: number;
  onLoadMore: () => void;
}) {
  return (
    <tr data-night-more={group.key} className="border-b border-stone-300 dark:border-stone-600">
      <td colSpan={colSpan} className="px-2 py-1 text-center text-sm">
        <button
          type="button"
          // Don't keep the focus: a focused button blocks the table's shortcuts
          onMouseDown={(event) => event.preventDefault()}
          onClick={onLoadMore}
          className="text-emerald-700 hover:underline dark:text-emerald-400"
        >
          Show more ({group.tasks.length} of {group.matching ?? group.total} shown)
        </button>
      </td>
    </tr>
  );
}

/**
 * List view: a plain header row where a new night starts on the page. Only a
 * visual grouping: no cursor stop, no ticking, no counts beyond this page.
 */
export function NightDividerRow({
  night,
  count,
  colSpan,
}: {
  night: string | null;
  /** Tasks of the night on this page */
  count: number;
  colSpan: number;
}) {
  return (
    <tr
      data-night-divider={night ?? "none"}
      className="border-y border-stone-300 bg-stone-100 dark:border-stone-600 dark:bg-stone-800"
    >
      <td colSpan={colSpan} className="px-2 py-1 text-sm">
        <span className="font-semibold text-stone-800 dark:text-stone-200">{formatNight(night)}</span>
        <span className="ml-3 tabular-nums text-xs text-stone-500 dark:text-stone-400">
          {count} {count === 1 ? "task" : "tasks"} on this page
        </span>
      </td>
    </tr>
  );
}
