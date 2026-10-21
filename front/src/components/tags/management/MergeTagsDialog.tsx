import { useMemo, useState } from "react";
import toast from "react-hot-toast";

import api from "@/app/api";
import Button from "@/components/Button";
import { DialogOverlay } from "@/components/Dialog";
import Tag from "@/components/tags/Tag";
import { WarningIcon } from "@/components/icons";
import { apiErrorMessage } from "@/hooks/api/useTagManagement";

import type { TagDetail } from "@/types";

function usage(tag: TagDetail) {
  return tag.sound_event_count + tag.task_count;
}

/**
 * Merge several tags into one. The user picks which selected tag survives;
 * every annotation using the other tags is moved to it.
 */
export default function MergeTagsDialog({
  tags,
  isOpen,
  onClose,
  onMerged,
}: {
  tags: TagDetail[];
  isOpen: boolean;
  onClose: () => void;
  onMerged: () => void;
}) {
  const mostUsed = useMemo(
    () => [...tags].sort((a, b) => usage(b) - usage(a))[0]?.id ?? null,
    [tags],
  );
  const [targetId, setTargetId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const target = targetId ?? mostUsed;

  const sources = tags.filter((tag) => tag.id !== target);
  const movedCount = sources.reduce((sum, tag) => sum + usage(tag), 0);

  const handleMerge = async () => {
    if (target == null || sources.length === 0) return;
    setSubmitting(true);
    try {
      const result = await api.tags.merge(
        sources.map((tag) => tag.id),
        target,
      );
      toast.success(
        `Merged ${result.merged_tags} tag${result.merged_tags === 1 ? "" : "s"} into ` +
          `${result.target.key}:${result.target.value}` +
          (result.duplicates_removed > 0
            ? ` (${result.duplicates_removed} duplicate assignments removed)`
            : ""),
      );
      setTargetId(null);
      onMerged();
      onClose();
    } catch (error) {
      toast.error(apiErrorMessage(error, "Failed to merge tags"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DialogOverlay title="Merge tags" isOpen={isOpen} onClose={onClose}>
      {() => (
        <div className="flex max-w-lg flex-col gap-4">
          <p className="text-sm">
            Choose the tag to keep. Annotations with the other tags are moved
            to it, and the other tags are deleted in{" "}
            <span className="font-semibold">all projects</span>.
          </p>
          <ul className="flex flex-col gap-1">
            {tags.map((tag) => (
              <li key={tag.id}>
                <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-stone-200 dark:hover:bg-stone-600">
                  <input
                    type="radio"
                    name="merge-target"
                    className="text-emerald-500 focus:ring-emerald-500"
                    checked={tag.id === target}
                    onChange={() => setTargetId(tag.id)}
                  />
                  <Tag tag={tag} count={null} disabled />
                  <span className="ml-auto text-xs tabular-nums text-stone-500">
                    {usage(tag)} uses
                  </span>
                  {tag.id === target && (
                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      keep
                    </span>
                  )}
                </label>
              </li>
            ))}
          </ul>
          <div className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
            <WarningIcon className="h-5 w-5 shrink-0" />
            <span>
              {sources.length} tag{sources.length === 1 ? "" : "s"} will be
              deleted and {movedCount} assignment{movedCount === 1 ? "" : "s"}{" "}
              moved. This cannot be undone.
            </span>
          </div>
          <div className="flex justify-end gap-2">
            <Button mode="text" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={submitting || sources.length === 0}
              onClick={handleMerge}
            >
              {submitting ? "Merging…" : "Merge tags"}
            </Button>
          </div>
        </div>
      )}
    </DialogOverlay>
  );
}
