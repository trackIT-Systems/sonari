import classNames from "classnames";

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
  className = "mb-4",
}: {
  progress: ProgressStats;
  className?: string;
}) {
  if (progress.total === 0) {
    return (
      <div className={classNames(className, "w-full")}>
        <div className="text-sm text-stone-500">No tasks available</div>
      </div>
    );
  }

  // Calculate percentage for each state relative to total tasks
  const pendingBasePerc = Math.max(((progress.pending.count) / progress.total) * 100, 0);
  const assignedPerc = (progress.pending.assigned / progress.total) * 100;
  const verifiedPerc = (progress.done.verified / progress.total) * 100;
  const completedPerc = (progress.done.completed / progress.total) * 100;
  const rejectedPerc = (progress.done.rejected / progress.total) * 100;

  console.log(progress.pending.count, progress.pending.assigned)

  return (
    <div className={classNames(className, "w-full flex flex-row gap-4 items-center")}>
      {/* Pending Bar */}
      <div className="flex flex-row items-center gap-2">
        <div className="w-24 h-2 bg-stone-200 dark:bg-stone-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gray-400 dark:bg-gray-600"
            style={{ width: `${pendingBasePerc}%` }}
          />
        </div>
        <div className="text-sm text-stone-600 dark:text-stone-400 whitespace-nowrap">
          {progress.pending.count} / {progress.total}
        </div>
      </div>

      {/* Completed Bar */}
      <div className="flex flex-row items-center gap-2">
        <div className="w-24 h-2 bg-stone-200 dark:bg-stone-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-600 dark:bg-emerald-400"
            style={{ width: `${completedPerc}%` }}
          />
        </div>
        <div className="text-sm text-stone-600 dark:text-stone-400 whitespace-nowrap">
          {progress.done.completed} / {progress.total}
        </div>
      </div>

      {/* Assigned Bar */}
      <div className="flex flex-row items-center gap-2">
        <div className="w-24 h-2 bg-stone-200 dark:bg-stone-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-500 dark:bg-amber-400"
            style={{ width: `${assignedPerc}%` }}
          />
        </div>
        <div className="text-sm text-stone-600 dark:text-stone-400 whitespace-nowrap">
          {progress.pending.assigned} / {progress.total}
        </div>
      </div>

      {/* Rejected Bar */}
      <div className="flex flex-row items-center gap-2">
        <div className="w-24 h-2 bg-stone-200 dark:bg-stone-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-red-600 dark:bg-red-400"
            style={{ width: `${rejectedPerc}%` }}
          />
        </div>
        <div className="text-sm text-stone-600 dark:text-stone-400 whitespace-nowrap">
          {progress.done.rejected} / {progress.total}
        </div>
      </div>

      {/* Verified Bar */}
      <div className="flex flex-row items-center gap-2">
        <div className="w-24 h-2 bg-stone-200 dark:bg-stone-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-600 dark:bg-blue-400"
            style={{ width: `${verifiedPerc}%` }}
          />
        </div>
        <div className="text-sm text-stone-600 dark:text-stone-400 whitespace-nowrap">
          {progress.done.verified} / {progress.total}
        </div>
      </div>
    </div>
  );
}