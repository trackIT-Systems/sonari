import classNames from "classnames";

import Spinner from "./Spinner";
import Tooltip from "./Tooltip";
import { CompleteIcon, HelpIcon, NeedsReviewIcon, VerifiedIcon } from "./icons";

type ProgressStats = {
  done: {
    count: number;
    verified: number;
    completed: number;
    rejected: number;
  };
  pending: {
    count: number;
    assigned: number;
  };
  total: number;
};

export default function ProgressBar({
  progress,
  loading = false,
  className = "mb-4",
}: {
  progress: ProgressStats;
  loading?: boolean;
  className?: string;
}) {
  if (loading) {
    return (
      <div className={classNames(className, "w-full")}>
        <div className="text-sm text-stone-500">Loading tasks...</div>
      </div>
    );
  }

  if (progress.total === 0) {
    return (
      <div className={classNames(className, "w-full")}>
        <div className="text-sm text-stone-500">No tasks available</div>
      </div>
    );
  }

  // Calculate percentage for each state relative to total tasks
  const pendingBasePerc = 100 - Math.max(((progress.pending.count) / progress.total) * 100, 0);
  const assignedPerc = (progress.pending.assigned / progress.total) * 100;
  const verifiedPerc = (progress.done.verified / progress.total) * 100;
  const completedPerc = (progress.done.completed / progress.total) * 100;
  const rejectedPerc = (progress.done.rejected / progress.total) * 100;

  return (
    <div className={classNames(className, "w-full flex flex-row gap-20 items-center")}>
      {/* Pending Bar */}
      <div className="flex flex-row items-center gap-2">
        <Tooltip
          tooltip={
            <div className="inline-flex items-center gap-1 text-gray-600 dark:text-gray-400">
              Any state
            </div>
          }
          placement="top"
        >
          <div className="w-24 h-3 bg-stone-200 dark:bg-stone-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gray-400 dark:bg-gray-600"
              style={{ width: `${pendingBasePerc}%` }}
            />
          </div>
        </Tooltip>
        <div className="text-sm text-stone-600 dark:text-stone-400 whitespace-nowrap">
          {progress.total - progress.pending.count} / {progress.total}
        </div>
      </div>

      {/* Completed Bar */}
      <div className="flex flex-row items-center gap-2">
        <Tooltip
          tooltip={
            <div className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <CompleteIcon className="w-5 h-5" />
              Done
            </div>
          }
          placement="top"
        >
          <div className="w-24 h-3 bg-stone-200 dark:bg-stone-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-600 dark:bg-emerald-400"
              style={{ width: `${completedPerc}%` }}
            />
          </div>
        </Tooltip>
        <div className="text-sm text-stone-600 dark:text-stone-400 whitespace-nowrap">
          {progress.done.completed} / {progress.total}
        </div>
      </div>

      {/* Assigned Bar */}
      <div className="flex flex-row items-center gap-2">
        <Tooltip
          tooltip={
            <div className="inline-flex items-center gap-1 text-amber-500 dark:text-amber-400">
              <HelpIcon className="w-5 h-5" />
              Unsure
            </div>
          }
          placement="top"
        >
          <div className="w-24 h-3 bg-stone-200 dark:bg-stone-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500 dark:bg-amber-400"
              style={{ width: `${assignedPerc}%` }}
            />
          </div>
        </Tooltip>
        <div className="text-sm text-stone-600 dark:text-stone-400 whitespace-nowrap">
          {progress.pending.assigned} / {progress.total}
        </div>
      </div>

      {/* Rejected Bar */}
      <div className="flex flex-row items-center gap-2">
        <Tooltip
          tooltip={
            <div className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
              <NeedsReviewIcon className="w-5 h-5" />
              Rejected
            </div>
          }
          placement="top"
        >
          <div className="w-24 h-3 bg-stone-200 dark:bg-stone-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-red-600 dark:bg-red-400"
              style={{ width: `${rejectedPerc}%` }}
            />
          </div>
        </Tooltip>
        <div className="text-sm text-stone-600 dark:text-stone-400 whitespace-nowrap">
          {progress.done.rejected} / {progress.total}
        </div>
      </div>

      {/* Verified Bar */}
      <div className="flex flex-row items-center gap-2">
        <Tooltip
          tooltip={
            <div className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400">
              <VerifiedIcon className="w-5 h-5" />
              Verified
            </div>
          }
          placement="top"
        >
          <div className="w-24 h-3 bg-stone-200 dark:bg-stone-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 dark:bg-blue-400"
              style={{ width: `${verifiedPerc}%` }}
            />
          </div>
        </Tooltip>
        <div className="text-sm text-stone-600 dark:text-stone-400 whitespace-nowrap">
          {progress.done.verified} / {progress.total}
        </div>
      </div>
    </div>
  );
}