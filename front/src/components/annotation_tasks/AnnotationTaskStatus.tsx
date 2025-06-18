import Loading from "@/app/loading";
import Button from "@/components/Button";
import { CompleteIcon, NeedsReviewIcon, HelpIcon, VerifiedIcon } from "@/components/icons";
import StatusBadge from "@/components/StatusBadge";
import Tooltip from "@/components/Tooltip";
import KeyboardKey from "@/components/KeyboardKey";

import { ACCEPT_TASK_SHORTCUT, REJECT_TASK_SHORTCUT, UNSURE_TASK_SHORTCUT, VERIFY_TASK_SHORTCUT } from "@/utils/keyboard";

import type { AnnotationStatus, AnnotationTask } from "@/types";

export default function AnnotationTaskStatus({
  task,
  onDone,
  onUnsure,
  onReview,
  onVerify,
  onRemoveBadge,
}: {
  task?: AnnotationTask;
  onDone?: () => void;
  onUnsure?: () => void;
  onReview?: () => void;
  onVerify?: () => void;
  onRemoveBadge?: (state: AnnotationStatus, userId?: string) => void;
}) {
  return (
    <div className="flex flex-row justify-between items-center border rounded-md border-stone-200 dark:border-stone-800 px-6">
      <div className="flex flex-row flex-wrap gap-2">
        {task == null ? (
          <Loading />
        ) : (
          task.status_badges?.map((badge) => (
            <StatusBadge
              key={`${badge.state}-${badge.user?.id}`}
              badge={badge}
              onRemove={() => onRemoveBadge?.(badge.state, badge.user?.id)}
            />
          ))
        )}
      </div>
      <div className="flex flex-row gap-2 justify-center">
        <Tooltip
          tooltip={
            <div className="inline-flex gap-2 items-center">
              Accept
              <div className="text-xs">
                <KeyboardKey code={ACCEPT_TASK_SHORTCUT} />
              </div>
            </div>
          }
          placement="bottom"
        >
          <Button mode="text" variant="primary" onClick={onDone}>
            <CompleteIcon className="w-8 h-8" />
          </Button>
        </Tooltip>
        <Tooltip
          tooltip={
            <div className="inline-flex gap-2 items-center">
              Unsure
              <div className="text-xs">
                <KeyboardKey code={UNSURE_TASK_SHORTCUT} />
              </div>
            </div>
          }
          placement="bottom"
        >
          <Button mode="text" variant="warning" onClick={onUnsure}>
            <HelpIcon className="w-8 h-8" />
          </Button>
        </Tooltip>
        <Tooltip
          tooltip={
            <div className="inline-flex gap-2 items-center">
              Reject
              <div className="text-xs">
                <KeyboardKey code={REJECT_TASK_SHORTCUT} />
              </div>
            </div>
          }
          placement="bottom"
        >
          <Button mode="text" variant="danger" onClick={onReview}>
            <NeedsReviewIcon className="w-8 h-8" />
          </Button>
        </Tooltip>
        <Tooltip
          tooltip={
            <div className="inline-flex gap-2 items-center">
              Verify
              <div className="text-xs">
                <KeyboardKey code={VERIFY_TASK_SHORTCUT} />
              </div>
            </div>
          }
          placement="bottom"
        >
          <Button mode="text" variant="info" onClick={onVerify}>
            <VerifiedIcon className="w-8 h-8" />
          </Button>
        </Tooltip>
      </div>
    </div>
  );
}
