import { useCallback, useEffect, useRef, useState } from "react";
import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import Button from "@/components/Button";
import { DialogOverlay } from "@/components/Dialog";
import { Input } from "@/components/inputs";
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
import KeyboardKey from "@/components/KeyboardKey";
import TagSearchBar from "@/components/tags/TagSearchBar";
import {
  ACCEPT_TASK_SHORTCUT,
  ADD_TAG_SHORTCUT,
  ADD_TO_TAGGED_TAG_SHORTCUT,
  DELETE_TAG_SHORTCUT,
  REJECT_TASK_SHORTCUT,
  REPLACE_TAG_SHORTCUT,
  UNSURE_TASK_SHORTCUT,
  VERIFY_TASK_SHORTCUT,
} from "@/utils/keyboard";
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

export type TagBulkPanel = "addTaskTag" | "replace" | "addToTagged" | "deleteSoundEvents";

/** Panels that list the sound event tags of the targeted tasks. */
export const SOUND_EVENT_TAG_PANELS: TagBulkPanel[] = [
  "replace",
  "addToTagged",
  "deleteSoundEvents",
];

type ConfirmContent = {
  title: string;
  /** What exactly will happen, e.g. 'Replace "a" with "b" on …'. */
  message: string;
  confirmLabel: string;
  destructive: boolean;
};

const STATUS_LABELS: Record<AnnotationStatus, string> = {
  completed: "Accepted",
  assigned: "Unsure",
  rejected: "Rejected",
  verified: "Verified",
};

function tagLabel(tag: Pick<Tag, "key" | "value">): string {
  return `"${tag.key}: ${tag.value}"`;
}

/** Replacing tags on more than this many tasks asks for confirmation. */
const REPLACE_CONFIRM_THRESHOLD = 10;

const STATUS_SHORTCUTS: Record<string, AnnotationStatus> = {
  [ACCEPT_TASK_SHORTCUT]: "completed",
  [UNSURE_TASK_SHORTCUT]: "assigned",
  [REJECT_TASK_SHORTCUT]: "rejected",
  [VERIFY_TASK_SHORTCUT]: "verified",
};

/** True when the key event comes from a field where the user is typing. */
function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
    return true;
  }
  if (target instanceof HTMLInputElement) {
    return !["checkbox", "radio", "button"].includes(target.type);
  }
  return false;
}

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
    return `all ${selectedTaskIds.length} tasks on this page`;
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
  bulkAddTag,
  bulkReplaceSoundEventTags,
  bulkDeleteSoundEventsByTag,
  onClearSelection,
  onSelectAllMatchingFilter,
  onSelectPageOnly,
  onTagBulkPanelOpenChange,
}: {
  targetMode: "selected" | "filter_all";
  selectedTaskIds: number[];
  filterTotal: number;
  currentPageTaskIds: number[];
  soundEventTagCounts: SoundEventTagBulkCount[];
  isTagSummaryLoading?: boolean;
  bulkAddBadge: BulkMutation<{ annotation_task_ids?: number[]; state: AnnotationStatus }>;
  bulkAddTag: BulkMutation<{
    annotation_task_ids?: number[];
    tag: Pick<Tag, "key" | "value">;
  }>;
  bulkReplaceSoundEventTags: BulkMutation<{
    annotation_task_ids?: number[];
    old_tag?: Pick<Tag, "key" | "value"> | null;
    new_tag?: Pick<Tag, "key" | "value"> | null;
    replace_all?: boolean;
    add_to_tagged?: boolean;
    replace_group?: string;
  }>;
  bulkDeleteSoundEventsByTag: BulkMutation<{
    annotation_task_ids?: number[];
    tag: Pick<Tag, "key" | "value">;
  }>;
  onClearSelection: () => void;
  /** Switch from "this page" to every task matching the filter. */
  onSelectAllMatchingFilter?: () => void;
  /** Switch back from "all matching the filter" to the current page. */
  onSelectPageOnly?: () => void;
  onTagBulkPanelOpenChange?: (panel: TagBulkPanel, open: boolean) => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [confirmContent, setConfirmContent] = useState<ConfirmContent | null>(null);
  const [openPanels, setOpenPanels] = useState<Record<TagBulkPanel, boolean>>({
    addTaskTag: false,
    replace: false,
    addToTagged: false,
    deleteSoundEvents: false,
  });
  const addTaskTagButtonRef = useRef<HTMLButtonElement>(null);
  const replaceButtonRef = useRef<HTMLButtonElement>(null);
  const addToTaggedButtonRef = useRef<HTMLButtonElement>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);

  const handlePanelOpenChange = useCallback(
    (panel: TagBulkPanel, open: boolean) => {
      setOpenPanels((prev) => (prev[panel] === open ? prev : { ...prev, [panel]: open }));
      onTagBulkPanelOpenChange?.(panel, open);
    },
    [onTagBulkPanelOpenChange],
  );
  const anyPanelOpen = Object.values(openPanels).some(Boolean);

  const targetLabel = buildTargetLabel({
    targetMode,
    selectedTaskIds,
    filterTotal,
    currentPageTaskIds,
  });

  const taskIds =
    targetMode === "selected" ? selectedTaskIds : undefined;

  // Whole page ticked while the filter matches more: offer the rest (Gmail style).
  const wholePageSelected =
    targetMode === "selected"
    && currentPageTaskIds.length > 0
    && currentPageTaskIds.every((id) => selectedTaskIds.includes(id))
    && filterTotal > selectedTaskIds.length;

  const targetCount =
    targetMode === "selected" ? selectedTaskIds.length : filterTotal;

  const [confirmText, setConfirmText] = useState("");

  /**
   * Run `action`, asking first when it targets all filtered tasks or when
   * `always` is set. The user confirms by typing the number of tasks.
   */
  const runWithConfirm = useCallback(
    (action: () => void, content: ConfirmContent, always = false) => {
      if (always || targetMode === "filter_all") {
        setPendingAction(() => action);
        setConfirmContent(content);
        setConfirmText("");
        setConfirmOpen(true);
      } else {
        action();
      }
    },
    [targetMode],
  );

  const confirmMatches = confirmText.trim() === String(targetCount);

  const handleConfirm = useCallback(() => {
    pendingAction?.();
    setPendingAction(null);
    setConfirmContent(null);
    setConfirmOpen(false);
  }, [pendingAction]);

  const confirmReplace = targetCount > REPLACE_CONFIRM_THRESHOLD;

  const handleStatus = useCallback(
    (state: AnnotationStatus) => {
      runWithConfirm(
        () => {
          bulkAddBadge.mutate(
            { annotation_task_ids: taskIds, state },
            { onSuccess: () => onClearSelection() },
          );
        },
        {
          title: "Set task status?",
          message: `Set the status "${STATUS_LABELS[state]}" on ${targetLabel}.`,
          confirmLabel: `Set ${STATUS_LABELS[state]}`,
          destructive: false,
        },
      );
    },
    [bulkAddBadge, onClearSelection, runWithConfirm, targetLabel, taskIds],
  );

  const handleAddTaskTag = useCallback(
    (tag: Tag) => {
      runWithConfirm(
        () => {
          bulkAddTag.mutate(
            { annotation_task_ids: taskIds, tag },
            { onSuccess: () => onClearSelection() },
          );
        },
        {
          title: "Add task tag?",
          message: `Add the task tag ${tagLabel(tag)} to ${targetLabel}.`,
          confirmLabel: "Add tag",
          destructive: false,
        },
      );
    },
    [bulkAddTag, onClearSelection, runWithConfirm, targetLabel, taskIds],
  );

  const tagCountsForPanel = soundEventTagCounts.map(({ key, value, count }) => ({
    tag: { key, value },
    count,
  }));

  const handleReplaceTag = useCallback(
    (oldTag: Tag | null, newTag: Tag, options?: { add_to_tagged?: boolean }) => {
      let message: string;
      if (isReplaceAllTag(oldTag)) {
        message = `Replace all tags of every tagged sound event with ${tagLabel(newTag)} in ${targetLabel}.`;
      } else if (oldTag == null) {
        message = `Add ${tagLabel(newTag)} to every sound event in ${targetLabel}.`;
      } else {
        message = `Replace ${tagLabel(oldTag)} with ${tagLabel(newTag)} on sound events in ${targetLabel}.`;
      }
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
      }, {
        title: "Replace sound event tags?",
        message: `${message} This cannot be undone in one step.`,
        confirmLabel: "Replace",
        destructive: false,
      }, confirmReplace);
    },
    [bulkReplaceSoundEventTags, confirmReplace, onClearSelection, runWithConfirm, targetLabel, taskIds],
  );

  const handleReplaceGroup = useCallback(
    (group: string) => {
      runWithConfirm(() => {
        bulkReplaceSoundEventTags.mutate(
          { annotation_task_ids: taskIds, replace_group: group },
          { onSuccess: () => onClearSelection() },
        );
      }, {
        title: "Replace with group tag?",
        message: `Replace every ${group} species tag with the group tag "group: ${group}" on sound events in ${targetLabel}. This cannot be undone in one step.`,
        confirmLabel: "Replace",
        destructive: false,
      }, confirmReplace);
    },
    [bulkReplaceSoundEventTags, confirmReplace, onClearSelection, runWithConfirm, targetLabel, taskIds],
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
      }, {
        title: "Add tag to tagged sound events?",
        message: `Add ${tagLabel(newTag)} to every sound event tagged ${tagLabel(filterTag)} in ${targetLabel}.`,
        confirmLabel: "Add tag",
        destructive: false,
      });
    },
    [bulkReplaceSoundEventTags, onClearSelection, runWithConfirm, targetLabel, taskIds],
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
          message: `Permanently delete every sound event whose only tag is ${tagLabel(tag)} in ${targetLabel}. ${count} sound event(s) carry this tag; those that also have other tags are kept. This cannot be undone.`,
          confirmLabel: "Delete",
          destructive: true,
        },
        true,
      );
    },
    [bulkDeleteSoundEventsByTag, onClearSelection, runWithConfirm, targetLabel, taskIds],
  );

  const isBusy =
    bulkAddBadge.isPending
    || bulkAddTag.isPending
    || bulkReplaceSoundEventTags.isPending
    || bulkDeleteSoundEventsByTag.isPending;

  // Keyboard shortcuts: 1-4 set the status, A / R / T / D open the tag panels.
  useEffect(() => {
    if (isBusy || confirmOpen || anyPanelOpen) return;

    const panelButtons: Record<string, React.RefObject<HTMLButtonElement | null>> = {
      [ADD_TAG_SHORTCUT]: addTaskTagButtonRef,
      [REPLACE_TAG_SHORTCUT]: replaceButtonRef,
      [ADD_TO_TAGGED_TAG_SHORTCUT]: addToTaggedButtonRef,
      [DELETE_TAG_SHORTCUT]: deleteButtonRef,
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      if (isTextEntryTarget(event.target)) return;
      // e.g. the shortcut help is open
      if (document.querySelector('[role="dialog"]')) return;

      const status = STATUS_SHORTCUTS[event.key];
      if (status) {
        event.preventDefault();
        handleStatus(status);
        return;
      }

      const button = panelButtons[event.key];
      // The task tag panel does not depend on the sound event tag summary
      if (button && (button === addTaskTagButtonRef || !isTagSummaryLoading)) {
        event.preventDefault();
        button.current?.click();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isBusy, confirmOpen, anyPanelOpen, handleStatus, isTagSummaryLoading]);

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
          {wholePageSelected && onSelectAllMatchingFilter && (
            <>
              {" · "}
              <button
                type="button"
                className="font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-emerald-300"
                onClick={onSelectAllMatchingFilter}
                disabled={isBusy}
              >
                Select all {filterTotal} matching the filter
              </button>
            </>
          )}
          {targetMode === "filter_all" && onSelectPageOnly && (
            <>
              {" (every page) · "}
              <button
                type="button"
                className="font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-emerald-300"
                onClick={onSelectPageOnly}
                disabled={isBusy}
              >
                Only this page
              </button>
            </>
          )}
        </span>
        <Button mode="text" variant="secondary" onClick={onClearSelection} disabled={isBusy}>
          Clear
        </Button>
      </div>
      <div className="flex flex-row flex-wrap items-center gap-2">
        <Button mode="text" variant="primary" onClick={() => handleStatus("completed")} disabled={isBusy} title={`Accepted (${ACCEPT_TASK_SHORTCUT})`}>
          <CompleteIcon className="h-6 w-6" />
        </Button>
        <Button mode="text" variant="warning" onClick={() => handleStatus("assigned")} disabled={isBusy} title={`Unsure (${UNSURE_TASK_SHORTCUT})`}>
          <HelpIcon className="h-6 w-6" />
        </Button>
        <Button mode="text" variant="danger" onClick={() => handleStatus("rejected")} disabled={isBusy} title={`Rejected (${REJECT_TASK_SHORTCUT})`}>
          <NeedsReviewIcon className="h-6 w-6" />
        </Button>
        <Button mode="text" variant="primary" onClick={() => handleStatus("verified")} disabled={isBusy} title={`Verified (${VERIFY_TASK_SHORTCUT})`}>
          <VerifiedIcon className="h-6 w-6" />
        </Button>
        <Popover as="div" className="relative">
          {({ open }) => (
            <>
              <ReportPopoverOpen
                open={open}
                panel="addTaskTag"
                onOpenChange={handlePanelOpenChange}
              />
              <PopoverButton
                as={Button}
                ref={addTaskTagButtonRef}
                mode="outline"
                variant="secondary"
                disabled={isBusy}
              >
                Add task tag <KeyboardKey code={ADD_TAG_SHORTCUT} />
              </PopoverButton>
              <PopoverPanel
                className="absolute left-0 z-50 mt-2 w-96 rounded-md border border-stone-200 bg-stone-50 shadow-lg dark:border-stone-500 dark:bg-stone-700"
              >
                {({ close }) => (
                  <div className="p-4">
                    <div className="mb-2 text-stone-700 dark:text-stone-300 underline underline-offset-2 decoration-amber-500 decoration-2">
                      Add tag to tasks ...
                    </div>
                    <TagSearchBar
                      placeholder="Search or create tag..."
                      onSelect={(tag) => {
                        close();
                        handleAddTaskTag(tag);
                      }}
                      autoFocus
                    />
                  </div>
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
                panel="replace"
                onOpenChange={handlePanelOpenChange}
              />
              <PopoverButton
                as={Button}
                ref={replaceButtonRef}
                mode="outline"
                variant="secondary"
                disabled={isBusy || isTagSummaryLoading}
              >
                Replace sound event tags <KeyboardKey code={REPLACE_TAG_SHORTCUT} />
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
                    onReplaceGroup={handleReplaceGroup}
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
                onOpenChange={handlePanelOpenChange}
              />
              <PopoverButton
                as={Button}
                ref={addToTaggedButtonRef}
                mode="outline"
                variant="secondary"
                disabled={isBusy || isTagSummaryLoading}
              >
                Add tag to tagged <KeyboardKey code={ADD_TO_TAGGED_TAG_SHORTCUT} />
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
                onOpenChange={handlePanelOpenChange}
              />
              <PopoverButton
                as={Button}
                ref={deleteButtonRef}
                mode="outline"
                variant="danger"
                disabled={isBusy || isTagSummaryLoading}
              >
                Delete sound events by tag <KeyboardKey code={DELETE_TAG_SHORTCUT} />
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
        title={confirmContent?.title}
      >
        {({ close }) => (
          <form
            className="flex max-w-md flex-col gap-4 p-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!confirmMatches) return;
              handleConfirm();
              close();
            }}
          >
            <p className="text-sm">{confirmContent?.message}</p>
            <label className="flex flex-col gap-1 text-sm">
              <span>
                Type <span className="font-semibold tabular-nums">{targetCount}</span>{" "}
                (the number of tasks) to confirm:
              </span>
              <Input
                autoFocus
                data-autofocus
                inputMode="numeric"
                autoComplete="off"
                aria-label="Number of tasks"
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
              />
            </label>
            <div className="flex flex-row justify-end gap-2">
              <Button type="button" mode="outline" variant="secondary" onClick={close}>
                Cancel
              </Button>
              <Button
                type="submit"
                mode="filled"
                variant={confirmContent?.destructive ? "danger" : "primary"}
                disabled={!confirmMatches}
              >
                {confirmContent?.confirmLabel}
              </Button>
            </div>
          </form>
        )}
      </DialogOverlay>
    </div>
  );
}
