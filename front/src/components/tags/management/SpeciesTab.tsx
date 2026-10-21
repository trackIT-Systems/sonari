import { useState } from "react";

import Button from "@/components/Button";
import Tag from "@/components/tags/Tag";
import MergeTagsDialog from "@/components/tags/management/MergeTagsDialog";
import { SpeciesLabel } from "@/components/tags/management/TagsTab";
import {
  useInvalidateTagQueries,
  useSpeciesDuplicates,
} from "@/hooks/api/useTagManagement";

import type { SpeciesTags, TagGroup } from "@/types";

export default function SpeciesTab({
  groups,
  canMerge,
}: {
  groups: TagGroup[];
  /** Whether the user may merge tags (administrators only). */
  canMerge: boolean;
}) {
  const duplicates = useSpeciesDuplicates();
  const invalidate = useInvalidateTagQueries();
  const [merging, setMerging] = useState<SpeciesTags | null>(null);
  const groupName = new Map(groups.map((group) => [group.id, group.name]));

  const items = duplicates.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-sm text-stone-600 dark:text-stone-400">
        These species are named by more than one tag, for example once in
        German and once in Latin.
        {canMerge && " Merge them to count them as one species."}
      </p>
      {duplicates.isLoading ? (
        <p className="text-sm italic text-stone-500">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm italic text-stone-500">
          No species is named by more than one tag.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-stone-200 dark:border-stone-700">
          <table className="min-w-full divide-y divide-stone-200 text-sm dark:divide-stone-700">
            <thead className="bg-stone-100 text-left text-xs uppercase tracking-wide text-stone-500 dark:bg-stone-800">
              <tr>
                <th className="px-3 py-2">Species</th>
                <th className="px-3 py-2">Group</th>
                <th className="px-3 py-2">Tags</th>
                {canMerge && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 dark:divide-stone-700">
              {items.map((item) => (
                <tr key={item.species.id}>
                  <td className="px-3 py-2">
                    <SpeciesLabel species={item.species} />
                  </td>
                  <td className="px-3 py-2 text-stone-500">
                    {item.species.group_id != null
                      ? groupName.get(item.species.group_id)
                      : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {item.tags.map((tag) => (
                        <span key={tag.id} className="inline-flex items-center gap-1">
                          <Tag tag={tag} count={null} disabled />
                          <span className="text-xs tabular-nums text-stone-500">
                            {tag.sound_event_count + tag.task_count}
                          </span>
                        </span>
                      ))}
                    </div>
                  </td>
                  {canMerge && (
                    <td className="px-3 py-2 text-right">
                      <Button
                        mode="outline"
                        variant="danger"
                        padding="px-3 py-1"
                        onClick={() => setMerging(item)}
                      >
                        Merge…
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {merging != null && (
        <MergeTagsDialog
          // Remount per species so the chosen target resets.
          key={merging.species.id}
          tags={merging.tags}
          isOpen={true}
          onClose={() => setMerging(null)}
          onMerged={invalidate}
        />
      )}
    </div>
  );
}
