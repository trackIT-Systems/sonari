import { useCallback, useEffect, useState } from "react";
import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import Button from "@/components/Button";
import { DialogOverlay } from "@/components/Dialog";
import {
  TagAddToTaggedPanel,
  TagDeleteSoundEventsPanel,
  TagReplacePanel,
} from "@/components/annotation_tasks/AnnotationTaskTags";
import {
  CompleteIcon,
  HelpIcon,
  NeedsReviewIcon,
  VerifiedIcon,
} from "@/components/icons";
import { isReplaceAllTag } from "@/utils/soundEventTagReplace";

import type { SoundEventTagBulkCount } from "@/api/annotation_tasks";
import type { AnnotationStatus, Tag } from "@/types";
import type { UseMutationResult } from "@tanstack/react-query";
import type { AnnotationTaskBulkResult } from "@/api/annotation_tasks";
import type { AxiosError } from "axios";

type BulkMutation<T> = UseMutationResult<
  AnnotationTaskBulkResult,
  AxiosError,
  T,
  unknown
>;

export type TagBulkPanel = "replace" | "addToTagged" | "deleteSoundEvents";

type ConfirmContent = {
  title: string;
  message: string;
  confirmLabel: string;
  destructive: boolean;
};

function ReportPopoverOpen({
  open,
  panel,
  onOpenChange,
}: {
  open: boolean;
  panel: TagBulkPanel;
  onOpenChange?: (panel: TagBulkPanel, open: boolean) => void;
}) {
  useEffect(() => {
    onOpenChange?.(panel, open);
  }, [open, onOpenChange, panel]);
  return null;
}

function BulkActionProgressBar() {
  return (
    <div
      className="h-1 w-full overflow-hidden rounded-full bg-emerald-200/80 dark:bg-emerald-900/50"
      role="progressbar"
      aria-valuetext="Bulk action in progress"
    >
      <div
        className="bulk-action-progress-indeterminate h-full w-1/3 rounded-full bg-emerald-600 motion-reduce:animate-none dark:bg-emerald-400"
      />
    </div>
  );
}

function buildTargetLabel({
  targetMode,
  selectedTaskIds,
  filterTotal,
  currentPageTaskIds,
}: {
  targetMode: "selected" | "filter_all";
  selectedTaskIds: number[];
  filterTotal: number;
  currentPageTaskIds: number[];
}): string {
  if (targetMode === "filter_all") {
    return `all ${filterTotal} tasks matching the current filter`;
  }

  const currentPageIdSet = new Set(currentPageTaskIds);
  const allCurrentPageRowsSelected =
    currentPageTaskIds.length > 0
    && currentPageTaskIds.every((id) => selectedTaskIds.includes(id));
  const selectionLimitedToCurrentPage =
    selectedTaskIds.length > 0
    && selectedTaskIds.every((id) => currentPageIdSet.has(id));

  if (
    selectionLimitedToCurrentPage
    && allCurrentPageRowsSelected
    && filterTotal > selectedTaskIds.length
  ) {
    return `all ${selectedTaskIds.length} on this page (${filterTotal} match filters — use “All ${filterTotal} filtered” in the table)`;
  }

  if (selectedTaskIds.some((id) => !currentPageIdSet.has(id))) {
    return `${selectedTaskIds.length} selected across pages`;
  }

  return `${selectedTaskIds.length} selected task(s)`;
}

export default function AnnotationTaskBulkActionBar({
  targetMode,
  selectedTaskIds,
  filterTotal,
  currentPageTaskIds,
  soundEventTagCounts,
  isTagSummaryLoading,
  bulkAddBadge,
  bulkReplaceSoundEventTags,
  bulkDeleteSoundEventsByTag,
  onClearSelection,
  onTagBulkPanelOpenChange,
}: {
  targetMode: "selected" | "filter_all";
  selectedTaskIds: number[];
  filterTotal: number;
  currentPageTaskIds: number[];
  soundEventTagCounts: SoundEventTagBulkCount[];
  isTagSummaryLoading?: boolean;
  bulkAddBadge: BulkMutation<{ annotation_task_ids?: number[]; state: AnnotationStatus }>;
  bulkReplaceSoundEventTags: BulkMutation<{
    annotation_task_ids?: number[];
    old_tag?: Pick<Tag, "key" | "value"> | null;
    new_tag?: Pick<Tag, "key" | "value"> | null;
    replace_all?: boolean;
    add_to_tagged?: boolean;
  }>;
  bulkDeleteSoundEventsByTag: BulkMutation<{
    annotation_task_ids?: number[];
    tag: Pick<Tag, "key" | "value">;
  }>;
  onClearSelection: () => void;
  onTagBulkPanelOpenChange?: (panel: TagBulkPanel, open: boolean) => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [confirmContent, setConfirmContent] = useState<ConfirmContent | null>(null);

  const targetLabel = buildTargetLabel({
    targetMode,
    selectedTaskIds,
    filterTotal,
    currentPageTaskIds,
  });

  const taskIds =
    targetMode === "selected" ? selectedTaskIds : undefined;

  const runWithConfirm = useCallback(
    (action: () => void, content?: ConfirmContent) => {
      if (content || targetMode === "filter_all") {
        setPendingAction(() => action);
        setConfirmContent(content ?? null);
        setConfirmOpen(true);
      } else {
        action();
      }
    },
    [targetMode],
  );

  const handleConfirm = useCallback(() => {
    pendingAction?.();
    setPendingAction(null);
    setConfirmContent(null);
    setConfirmOpen(false);
  }, [pendingAction]);

  const handleStatus = useCallback(
    (state: AnnotationStatus) => {
      runWithConfirm(() => {
        bulkAddBadge.mutate(
          { annotation_task_ids: taskIds, state },
          { onSuccess: () => onClearSelection() },
        );
      });
    },
    [bulkAddBadge, onClearSelection, runWithConfirm, taskIds],
  );

  const tagCountsForPanel = soundEventTagCounts.map(({ key, value, count }) => ({
    tag: { key, value },
    count,
  }));

  const handleReplaceTag = useCallback(
    (oldTag: Tag | null, newTag: Tag, options?: { add_to_tagged?: boolean }) => {
      runWithConfirm(() => {
        bulkReplaceSoundEventTags.mutate(
          {
            annotation_task_ids: taskIds,
            old_tag: oldTag,
            new_tag: newTag,
            replace_all: isReplaceAllTag(oldTag),
            add_to_tagged: options?.add_to_tagged ?? false,
          },
          { onSuccess: () => onClearSelection() },
        );
      });
    },
    [bulkReplaceSoundEventTags, onClearSelection, runWithConfirm, taskIds],
  );

  const handleAddTagToTagged = useCallback(
    (filterTag: Tag, newTag: Tag) => {
      runWithConfirm(() => {
        bulkReplaceSoundEventTags.mutate(
          {
            annotation_task_ids: taskIds,
            old_tag: filterTag,
            new_tag: newTag,
            add_to_tagged: true,
          },
          { onSuccess: () => onClearSelection() },
        );
      });
    },
    [bulkReplaceSoundEventTags, onClearSelection, runWithConfirm, taskIds],
  );

  const handleDeleteSoundEvents = useCallback(
    (tag: Tag, count: number) => {
      runWithConfirm(
        () => {
          bulkDeleteSoundEventsByTag.mutate(
            { annotation_task_ids: taskIds, tag },
            { onSuccess: () => onClearSelection() },
          );
        },
        {
          title: "Delete sound events?",
          message: `This will permanently delete every sound event whose only tag is "${tag.key}: ${tag.value}" across ${targetLabel}. ${count} sound event(s) carry this tag; those that also have other tags are skipped. This cannot be undone.`,
          confirmLabel: "Delete",
          destructive: true,
        },
      );
    },
    [bulkDeleteSoundEventsByTag, onClearSelection, runWithConfirm, targetLabel, taskIds],
  );

  const isBusy =
    bulkAddBadge.isPending
    || bulkReplaceSoundEventTags.isPending
    || bulkDeleteSoundEventsByTag.isPending;

  return (
    <div className="flex flex-col gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950/40">
      {isBusy && (
        <div className="flex flex-col gap-1">
          <BulkActionProgressBar />
          <span className="text-xs text-stone-600 dark:text-stone-400">
            Applying bulk action…
          </span>
        </div>
      )}
      <div className="flex flex-row flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-stone-700 dark:text-stone-300">
          Bulk actions on {targetLabel}
        </span>
        <Button mode="text" variant="secondary" onClick={onClearSelection} disabled={isBusy}>
          Clear
        </Button>
      </div>
      <div className="flex flex-row flex-wrap items-center gap-2">
        <Button mode="text" variant="primary" onClick={() => handleStatus("completed")} disabled={isBusy}>
          <CompleteIcon className="h-6 w-6" />
        </Button>
        <Button mode="text" variant="warning" onClick={() => handleStatus("assigned")} disabled={isBusy}>
          <HelpIcon className="h-6 w-6" />
        </Button>
        <Button mode="text" variant="danger" onClick={() => handleStatus("rejected")} disabled={isBusy}>
          <NeedsReviewIcon className="h-6 w-6" />
        </Button>
        <Button mode="text" variant="primary" onClick={() => handleStatus("verified")} disabled={isBusy}>
          <VerifiedIcon className="h-6 w-6" />
        </Button>
        <Popover as="div" className="relative">
          {({ open }) => (
            <>
              <ReportPopoverOpen
                open={open}
                panel="replace"
                onOpenChange={onTagBulkPanelOpenChange}
              />
              <PopoverButton
                as={Button}
                mode="outline"
                variant="secondary"
                disabled={isBusy || isTagSummaryLoading}
              >
                Replace sound event tags
              </PopoverButton>
              <PopoverPanel
                className="absolute left-0 z-50 mt-2 w-96 rounded-md border border-stone-200 bg-stone-50 shadow-lg dark:border-stone-500 dark:bg-stone-700"
              >
                {isTagSummaryLoading ? (
                  <p className="p-4 text-sm text-stone-500">Loading tags for selected tasks…</p>
                ) : (
                  <TagReplacePanel
                    taskTags={tagCountsForPanel}
                    onReplaceTag={(oldTag, newTag) => {
                      handleReplaceTag(oldTag, newTag);
                    }}
                  />
                )}
              </PopoverPanel>
            </>
          )}
        </Popover>
        <Popover as="div" className="relative">
          {({ open }) => (
            <>
              <ReportPopoverOpen
                open={open}
                panel="addToTagged"
                onOpenChange={onTagBulkPanelOpenChange}
              />
              <PopoverButton
                as={Button}
                mode="outline"
                variant="secondary"
                disabled={isBusy || isTagSummaryLoading}
              >
                Add tag to tagged
              </PopoverButton>
              <PopoverPanel
                className="absolute left-0 z-50 mt-2 w-96 rounded-md border border-stone-200 bg-stone-50 shadow-lg dark:border-stone-500 dark:bg-stone-700"
              >
                {isTagSummaryLoading ? (
                  <p className="p-4 text-sm text-stone-500">Loading tags for selected tasks…</p>
                ) : (
                  <TagAddToTaggedPanel
                    taskTags={tagCountsForPanel}
                    onAddTag={(filterTag, newTag) => {
                      handleAddTagToTagged(filterTag, newTag);
                    }}
                  />
                )}
              </PopoverPanel>
            </>
          )}
        </Popover>
        <Popover as="div" className="relative">
          {({ open }) => (
            <>
              <ReportPopoverOpen
                open={open}
                panel="deleteSoundEvents"
                onOpenChange={onTagBulkPanelOpenChange}
              />
              <PopoverButton
                as={Button}
                mode="outline"
                variant="danger"
                disabled={isBusy || isTagSummaryLoading}
              >
                Delete sound events by tag
              </PopoverButton>
              <PopoverPanel
                className="absolute left-0 z-50 mt-2 w-96 rounded-md border border-stone-200 bg-stone-50 shadow-lg dark:border-stone-500 dark:bg-stone-700"
              >
                {({ close }) =>
                  isTagSummaryLoading ? (
                    <p className="p-4 text-sm text-stone-500">Loading tags for selected tasks…</p>
                  ) : (
                    <TagDeleteSoundEventsPanel
                      taskTags={tagCountsForPanel}
                      onDeleteSoundEvents={(tag, count) => {
                        close();
                        handleDeleteSoundEvents(tag, count);
                      }}
                    />
                  )
                }
              </PopoverPanel>
            </>
          )}
        </Popover>
      </div>

      <DialogOverlay
        isOpen={confirmOpen}
        onClose={() => {
          setConfirmOpen(false);
          setPendingAction(null);
          setConfirmContent(null);
        }}
        title={confirmContent?.title ?? "Apply to all matching tasks?"}
      >
        {({ close }) => (
          <div className="flex flex-col gap-4 p-4">
            <p className="text-sm">
              {confirmContent?.message
                ?? `This will update ${filterTotal} annotation tasks that match your current filters. This cannot be undone in one step.`}
            </p>
            <div className="flex flex-row justify-end gap-2">
              <Button mode="outline" variant="secondary" onClick={close}>
                Cancel
              </Button>
              <Button
                mode="filled"
                variant={confirmContent?.destructive ? "danger" : "primary"}
                onClick={() => {
                  handleConfirm();
                  close();
                }}
              >
                {confirmContent?.confirmLabel ?? "Apply"}
              </Button>
            </div>
          </div>
        )}
      </DialogOverlay>
    </div>
  );
}
