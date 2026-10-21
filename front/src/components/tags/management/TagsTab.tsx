import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import api from "@/app/api";
import Button from "@/components/Button";
import { Input } from "@/components/inputs";
import Pagination from "@/components/lists/Pagination";
import Tag from "@/components/tags/Tag";
import MergeTagsDialog from "@/components/tags/management/MergeTagsDialog";
import KeyboardKey from "@/components/KeyboardKey";
import {
  SHORTCUT_KEYS,
  TAG_DETAILS_KEY,
  apiErrorMessage,
  useInvalidateTagQueries,
  useTagShortcuts,
} from "@/hooks/api/useTagManagement";
import usePagedQuery from "@/hooks/utils/usePagedQuery";

import type { TagDetailQuery } from "@/api/tags";
import type { SpeciesInfo, TagDetail, TagGroup } from "@/types";

export const SELECT_CLASS =
  "rounded-md border border-stone-300 bg-stone-50 py-1.5 pl-2 pr-8 text-sm text-stone-700 focus:border-emerald-500 focus:ring-emerald-500 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-300 disabled:opacity-60";

/** Value of the group filter: all tags, ungrouped tags, or a group id. */
export type GroupFilter = "all" | "none" | number;

function GroupSelect({
  value,
  groups,
  onChange,
  placeholder = "No group",
}: {
  value: number | null | undefined;
  groups: TagGroup[];
  onChange: (groupId: number | null) => void;
  placeholder?: string;
}) {
  return (
    <select
      className={SELECT_CLASS}
      value={value ?? ""}
      onChange={(event) =>
        onChange(event.target.value === "" ? null : Number(event.target.value))
      }
    >
      <option value="">{placeholder}</option>
      {groups.map((group) => (
        <option key={group.id} value={group.id}>
          {group.name}
        </option>
      ))}
    </select>
  );
}

/** Scientific and German name of the species a tag names. */
export function SpeciesLabel({ species }: { species: SpeciesInfo }) {
  return (
    <span className="text-xs text-stone-500 dark:text-stone-400">
      <span className="italic">{species.scientific_name}</span>
      {species.name_de && <> · {species.name_de}</>}
    </span>
  );
}

/** The shortcut keys 1-9, 0 and the tag each one picks in the tag search. */
function ShortcutOverview({
  onClear,
}: {
  onClear: (shortcut: string) => void;
}) {
  const shortcuts = useTagShortcuts();
  const byKey = new Map((shortcuts.data ?? []).map((tag) => [tag.shortcut, tag]));

  return (
    <div className="flex flex-col gap-2 rounded-md border border-stone-200 p-3 dark:border-stone-700">
      <p className="text-xs text-stone-500">
        Keyboard shortcuts, shared by all users. In the tag search press the key
        before typing, or Alt + key at any time. Set them in the Key column below.
      </p>
      <div className="flex flex-wrap gap-2">
        {SHORTCUT_KEYS.map((key) => {
          const tag = byKey.get(key);
          return (
            <span
              key={key}
              className="inline-flex items-center gap-1 rounded-md bg-stone-100 px-1.5 py-1 dark:bg-stone-800"
            >
              <KeyboardKey code={key} />
              {tag ? (
                <Tag tag={tag} count={null} compact onClose={() => onClear(key)} />
              ) : (
                <span className="text-xs text-stone-400">—</span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** Create a tag; it can be put into a group right away. */
function CreateTagForm({
  groups,
  onCreated,
}: {
  groups: TagGroup[];
  onCreated: () => void;
}) {
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [groupId, setGroupId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const ready = key.trim() !== "" && value.trim() !== "";

  return (
    <form
      className="flex flex-wrap items-end gap-3 rounded-md border border-stone-200 p-3 dark:border-stone-700"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!ready) return;
        setSubmitting(true);
        try {
          const tag = await api.tags.create(
            { key: key.trim(), value: value.trim() },
            { groupId: groupId ?? undefined },
          );
          toast.success(`Created ${tag.key}:${tag.value}`);
          setKey("");
          setValue("");
          onCreated();
        } catch (error) {
          toast.error(apiErrorMessage(error, "Failed to create tag"));
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Key</span>
        <Input
          value={key}
          placeholder="e.g. species"
          onChange={(event) => setKey(event.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Value</span>
        <Input
          value={value}
          placeholder="e.g. Myotis myotis"
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Group</span>
        <GroupSelect
          value={groupId}
          groups={groups}
          placeholder="General"
          onChange={setGroupId}
        />
      </label>
      <Button type="submit" disabled={submitting || !ready}>
        Create tag
      </Button>
      <span className="basis-full text-xs text-stone-500">
        A tag that names a species from the catalog joins that species&apos;
        group automatically.
      </span>
    </form>
  );
}

export default function TagsTab({
  groups,
  canMerge,
  groupFilter,
  onGroupFilterChange,
}: {
  groups: TagGroup[];
  /** Whether the user may merge tags (administrators only). */
  canMerge: boolean;
  groupFilter: GroupFilter;
  onGroupFilterChange: (filter: GroupFilter) => void;
}) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortBy, setSortBy] = useState("key");
  const [selected, setSelected] = useState<Map<number, TagDetail>>(new Map());
  const [mergeOpen, setMergeOpen] = useState(false);
  const invalidate = useInvalidateTagQueries();

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(timeout);
  }, [search]);

  const filter = useMemo<TagDetailQuery>(
    () => ({
      search: debouncedSearch || undefined,
      group: groupFilter === "all" ? undefined : groupFilter,
      sort_by: sortBy,
    }),
    [debouncedSearch, groupFilter, sortBy],
  );

  const { items, total, pagination, query } = usePagedQuery({
    name: TAG_DETAILS_KEY,
    queryFn: api.tags.getDetails,
    pageSize: 50,
    filter,
  });

  const groupName = useMemo(
    () => new Map(groups.map((group) => [group.id, group.name])),
    [groups],
  );

  const toggle = (tag: TagDetail) =>
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(tag.id)) next.delete(tag.id);
      else next.set(tag.id, tag);
      return next;
    });

  const allOnPageSelected =
    items.length > 0 && items.every((tag) => selected.has(tag.id));

  const togglePage = () =>
    setSelected((current) => {
      const next = new Map(current);
      for (const tag of items) {
        if (allOnPageSelected) next.delete(tag.id);
        else next.set(tag.id, tag);
      }
      return next;
    });

  const assignGroup = async (tagIds: number[], groupId: number | null) => {
    try {
      const count = await api.tags.assignGroup(tagIds, groupId);
      const name = groupId == null ? "no group" : groupName.get(groupId);
      toast.success(`Moved ${count} tag${count === 1 ? "" : "s"} to ${name}`);
      invalidate();
    } catch (error) {
      toast.error(apiErrorMessage(error, "Failed to update tag group"));
    }
  };

  const setShortcut = async (shortcut: string, tag: TagDetail | null) => {
    try {
      await api.tags.setShortcut(shortcut, tag?.id ?? null);
      toast.success(
        tag ? `Key ${shortcut} picks ${tag.key}:${tag.value}` : `Key ${shortcut} cleared`,
      );
      invalidate();
    } catch (error) {
      toast.error(apiErrorMessage(error, "Failed to set shortcut"));
    }
  };

  const selectedTags = Array.from(selected.values());

  return (
    <div className="flex flex-col gap-4">
      <CreateTagForm groups={groups} onCreated={invalidate} />
      <ShortcutOverview onClear={(key) => setShortcut(key, null)} />
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-72">
          <Input
            placeholder="Search tags or species names…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <select
          className={SELECT_CLASS}
          aria-label="Filter by group"
          value={String(groupFilter)}
          onChange={(event) => {
            const value = event.target.value;
            onGroupFilterChange(
              value === "all" || value === "none" ? value : Number(value),
            );
          }}
        >
          <option value="all">All groups</option>
          <option value="none">General (no group)</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
        <select
          className={SELECT_CLASS}
          aria-label="Sort tags"
          value={sortBy}
          onChange={(event) => setSortBy(event.target.value)}
        >
          <option value="key">Sort by key</option>
          <option value="value">Sort by value</option>
          <option value="-usage">Most used first</option>
          <option value="usage">Least used first</option>
        </select>
        <span className="text-sm text-stone-500">{total} tags</span>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-emerald-500/40 bg-emerald-50 px-3 py-2 text-sm dark:bg-emerald-900/20">
          <span className="font-medium">{selected.size} selected</span>
          <select
            className={SELECT_CLASS}
            aria-label="Set group of selected tags"
            value=""
            onChange={async (event) => {
              if (event.target.value === "") return;
              const groupId =
                event.target.value === "none" ? null : Number(event.target.value);
              await assignGroup(Array.from(selected.keys()), groupId);
              setSelected(new Map());
            }}
          >
            <option value="">Set group…</option>
            <option value="none">General (no group)</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
          {canMerge && (
            <Button
              variant="danger"
              mode="outline"
              padding="px-3 py-1.5"
              disabled={selected.size < 2}
              onClick={() => setMergeOpen(true)}
            >
              Merge…
            </Button>
          )}
          <Button
            mode="text"
            variant="secondary"
            padding="px-2 py-1.5"
            onClick={() => setSelected(new Map())}
          >
            Clear selection
          </Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-md border border-stone-200 dark:border-stone-700">
        <table className="min-w-full divide-y divide-stone-200 text-sm dark:divide-stone-700">
          <thead className="bg-stone-100 text-left text-xs uppercase tracking-wide text-stone-500 dark:bg-stone-800">
            <tr>
              <th className="w-10 px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="Select all tags on this page"
                  className="rounded text-emerald-500 focus:ring-emerald-500"
                  checked={allOnPageSelected}
                  onChange={togglePage}
                />
              </th>
              <th className="px-3 py-2">Tag</th>
              <th className="px-3 py-2">Group</th>
              <th className="px-3 py-2">Key</th>
              <th className="px-3 py-2 text-right">Sound events</th>
              <th className="px-3 py-2 text-right">Tasks</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200 dark:divide-stone-700">
            {items.map((tag) => (
              <tr
                key={tag.id}
                className={
                  selected.has(tag.id)
                    ? "bg-emerald-50/60 dark:bg-emerald-900/10"
                    : undefined
                }
              >
                <td className="px-3 py-1.5">
                  <input
                    type="checkbox"
                    aria-label={`Select ${tag.key}:${tag.value}`}
                    className="rounded text-emerald-500 focus:ring-emerald-500"
                    checked={selected.has(tag.id)}
                    onChange={() => toggle(tag)}
                  />
                </td>
                <td className="px-3 py-1.5">
                  <div className="flex flex-col items-start gap-0.5">
                    <Tag tag={tag} count={null} disabled />
                    {tag.species && <SpeciesLabel species={tag.species} />}
                  </div>
                </td>
                <td className="px-3 py-1.5">
                  <GroupSelect
                    value={tag.group_id}
                    groups={groups}
                    placeholder="General"
                    onChange={(groupId) => assignGroup([tag.id], groupId)}
                  />
                </td>
                <td className="px-3 py-1.5">
                  <select
                    className={SELECT_CLASS}
                    aria-label={`Shortcut key for ${tag.key}:${tag.value}`}
                    value={tag.shortcut ?? ""}
                    onChange={(event) =>
                      event.target.value === ""
                        ? setShortcut(tag.shortcut!, null)
                        : setShortcut(event.target.value, tag)
                    }
                  >
                    <option value="">—</option>
                    {SHORTCUT_KEYS.map((key) => (
                      <option key={key} value={key}>
                        {key}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {tag.sound_event_count}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {tag.task_count}
                </td>
              </tr>
            ))}
            {items.length === 0 && !query.isLoading && (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-6 text-center text-stone-500"
                >
                  No tags found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {pagination.numPages > 1 && <Pagination {...pagination} />}

      <MergeTagsDialog
        tags={selectedTags}
        isOpen={mergeOpen}
        onClose={() => setMergeOpen(false)}
        onMerged={() => {
          setSelected(new Map());
          invalidate();
        }}
      />
    </div>
  );
}
