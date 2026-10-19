import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

import api from "@/app/api";
import { useAuth } from "@/components/auth/AuthContext";
import Button from "@/components/Button";
import Card from "@/components/Card";
import { H3 } from "@/components/Headings";
import { Input, TextArea } from "@/components/inputs";
import { AddIcon, DeleteIcon, EditIcon } from "@/components/icons";
import Tag from "@/components/tags/Tag";
import { SELECT_CLASS } from "@/components/tags/management/TagsTab";
import {
  TAG_DETAILS_KEY,
  apiErrorMessage,
  useInvalidateTagQueries,
} from "@/hooks/api/useTagManagement";

import type { TagDetail, TagGroup, TagPreset } from "@/types";

/** Search tags (restricted to a group, if given) and add them to a list. */
function TagPicker({
  groupId,
  exclude,
  onAdd,
}: {
  groupId: number | null;
  exclude: Set<number>;
  onAdd: (tags: TagDetail[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(timeout);
  }, [search]);

  const results = useQuery({
    queryKey: [TAG_DETAILS_KEY, "picker", debounced, groupId],
    queryFn: () =>
      api.tags.getDetails({
        search: debounced || undefined,
        group: groupId ?? undefined,
        limit: 200,
      }),
  });

  const candidates = (results.data?.items ?? []).filter(
    (tag) => !exclude.has(tag.id),
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Search tags to add…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Button
          mode="outline"
          variant="secondary"
          padding="px-3 py-2"
          className="shrink-0 whitespace-nowrap"
          disabled={candidates.length === 0}
          onClick={() => onAdd(candidates)}
        >
          Add all {candidates.length}
        </Button>
      </div>
      <div className="flex max-h-48 flex-wrap gap-1 overflow-y-auto rounded-md border border-stone-200 p-2 dark:border-stone-700">
        {candidates.length === 0 ? (
          <span className="text-sm italic text-stone-500">
            {results.isLoading ? "Loading…" : "No more tags match."}
          </span>
        ) : (
          candidates.map((tag) => (
            <Tag
              key={tag.id}
              tag={tag}
              count={null}
              title="Add to preset"
              onClick={() => onAdd([tag])}
            />
          ))
        )}
      </div>
    </div>
  );
}

function PresetForm({
  initial,
  groups,
  onSaved,
  onCancel,
}: {
  initial?: TagPreset;
  groups: TagGroup[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [groupId, setGroupId] = useState<number | null>(
    initial?.group_id ?? null,
  );
  const [tags, setTags] = useState<TagDetail[]>(initial?.tags ?? []);
  const [submitting, setSubmitting] = useState(false);

  const save = async () => {
    setSubmitting(true);
    const data = {
      name: name.trim(),
      description,
      group_id: groupId,
      tag_ids: tags.map((tag) => tag.id),
    };
    try {
      if (initial) await api.tags.updatePreset(initial.id, data);
      else await api.tags.createPreset(data);
      toast.success(initial ? "Preset saved" : `Preset "${data.name}" created`);
      onSaved();
    } catch (error) {
      toast.error(apiErrorMessage(error, "Failed to save preset"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) save();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Name</span>
            <Input
              value={name}
              placeholder="e.g. German Bats"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Group</span>
            <select
              className={SELECT_CLASS}
              value={groupId ?? ""}
              onChange={(event) =>
                setGroupId(
                  event.target.value === "" ? null : Number(event.target.value),
                )
              }
            >
              <option value="">Any group</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Description</span>
          <TextArea
            rows={2}
            value={description}
            placeholder="What is this preset for?"
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Tags in preset ({tags.length})</span>
          <div className="flex min-h-[2.5rem] flex-wrap gap-1 rounded-md bg-stone-100 p-2 dark:bg-stone-800">
            {tags.length === 0 ? (
              <span className="italic text-stone-500">
                No tags yet — add some below.
              </span>
            ) : (
              tags.map((tag) => (
                <Tag
                  key={tag.id}
                  tag={tag}
                  count={null}
                  onClose={() =>
                    setTags((current) => current.filter((t) => t.id !== tag.id))
                  }
                />
              ))
            )}
          </div>
        </div>
        <TagPicker
          groupId={groupId}
          exclude={new Set(tags.map((tag) => tag.id))}
          onAdd={(added) => setTags((current) => [...current, ...added])}
        />
        <div className="flex justify-end gap-2">
          <Button mode="text" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || !name.trim()}>
            {initial ? "Save preset" : "Create preset"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function PresetCard({
  preset,
  groups,
  canEdit,
  onEdit,
}: {
  preset: TagPreset;
  groups: TagGroup[];
  canEdit: boolean;
  onEdit: () => void;
}) {
  const invalidate = useInvalidateTagQueries();
  const group = groups.find((g) => g.id === preset.group_id);

  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div>
          <H3 className="!mb-0">{preset.name}</H3>
          <span className="text-sm text-stone-500">
            {group ? `${group.name} · ` : ""}
            {preset.tags.length} tag{preset.tags.length === 1 ? "" : "s"}
          </span>
        </div>
        {canEdit && (
          <div className="flex gap-1">
            <Button
              mode="text"
              variant="secondary"
              padding="p-1"
              aria-label={`Edit ${preset.name}`}
              onClick={onEdit}
            >
              <EditIcon className="h-5 w-5" />
            </Button>
            <Button
              mode="text"
              variant="danger"
              padding="p-1"
              aria-label={`Delete ${preset.name}`}
              onClick={async () => {
                if (
                  !window.confirm(
                    `Delete the preset "${preset.name}"? Projects using it fall back to their automatic tag group.`,
                  )
                )
                  return;
                try {
                  await api.tags.deletePreset(preset.id);
                  toast.success("Preset deleted");
                  invalidate();
                } catch (error) {
                  toast.error(apiErrorMessage(error, "Failed to delete preset"));
                }
              }}
            >
              <DeleteIcon className="h-5 w-5" />
            </Button>
          </div>
        )}
      </div>
      {preset.description && (
        <p className="text-sm text-stone-600 dark:text-stone-400">
          {preset.description}
        </p>
      )}
      <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto">
        {preset.tags.map((tag) => (
          <Tag key={tag.id} tag={tag} count={null} disabled />
        ))}
      </div>
    </Card>
  );
}

export default function PresetsTab({
  presets,
  groups,
  isSuperuser,
}: {
  presets: TagPreset[];
  groups: TagGroup[];
  isSuperuser: boolean;
}) {
  const { user } = useAuth();
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const invalidate = useInvalidateTagQueries();

  const done = () => {
    setEditing(null);
    invalidate();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-sm text-stone-600 dark:text-stone-400">
          Presets are curated tag lists such as &ldquo;German Bats&rdquo;. A
          project can use a preset as its tag set in the project overview; its
          tag search then shows the preset&apos;s tags plus general tags.
        </p>
        {editing !== "new" && (
          <Button onClick={() => setEditing("new")}>
            <AddIcon className="mr-1 inline-block h-5 w-5 align-middle" />
            New preset
          </Button>
        )}
      </div>
      {editing === "new" && (
        <PresetForm groups={groups} onSaved={done} onCancel={() => setEditing(null)} />
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {presets.map((preset) =>
          editing === preset.id ? (
            <PresetForm
              key={preset.id}
              initial={preset}
              groups={groups}
              onSaved={done}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <PresetCard
              key={preset.id}
              preset={preset}
              groups={groups}
              canEdit={isSuperuser || preset.created_by_id === user?.id}
              onEdit={() => setEditing(preset.id)}
            />
          ),
        )}
      </div>
      {presets.length === 0 && editing !== "new" && (
        <p className="text-sm italic text-stone-500">No presets yet.</p>
      )}
    </div>
  );
}
