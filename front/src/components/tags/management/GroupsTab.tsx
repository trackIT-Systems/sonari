import { useState } from "react";
import toast from "react-hot-toast";

import api from "@/app/api";
import Button from "@/components/Button";
import Card from "@/components/Card";
import { H3 } from "@/components/Headings";
import { Input } from "@/components/inputs";
import { AddIcon, DeleteIcon, EditIcon } from "@/components/icons";
import {
  apiErrorMessage,
  useInvalidateTagQueries,
} from "@/hooks/api/useTagManagement";

import type { TagGroup } from "@/types";

function parseKeywords(text: string): string[] {
  return text
    .split(",")
    .map((keyword) => keyword.trim())
    .filter(Boolean);
}

function GroupForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: TagGroup;
  submitLabel: string;
  onSubmit: (name: string, keywords: string[]) => Promise<void>;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [keywords, setKeywords] = useState(
    initial?.project_keywords.join(", ") ?? "",
  );
  const [submitting, setSubmitting] = useState(false);

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!name.trim()) return;
        setSubmitting(true);
        try {
          await onSubmit(name.trim(), parseKeywords(keywords));
          if (initial == null) {
            setName("");
            setKeywords("");
          }
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Name</span>
        <Input
          value={name}
          placeholder="e.g. Bat"
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Project name keywords</span>
        <Input
          value={keywords}
          placeholder="e.g. bat, yolobat, fledermaus"
          onChange={(event) => setKeywords(event.target.value)}
        />
        <span className="text-xs text-stone-500">
          Comma separated. Projects whose name contains one of these words use
          this group automatically.
        </span>
      </label>
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button mode="text" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={submitting || !name.trim()}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function GroupCard({
  group,
  onShowTags,
}: {
  group: TagGroup;
  onShowTags: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const invalidate = useInvalidateTagQueries();

  if (editing) {
    return (
      <Card>
        <GroupForm
          initial={group}
          submitLabel="Save"
          onCancel={() => setEditing(false)}
          onSubmit={async (name, keywords) => {
            try {
              await api.tags.updateGroup(group.id, {
                name,
                project_keywords: keywords,
              });
              toast.success("Group updated");
              setEditing(false);
              invalidate();
            } catch (error) {
              toast.error(apiErrorMessage(error, "Failed to update group"));
            }
          }}
        />
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div>
          <H3 className="!mb-0">{group.name}</H3>
          <button
            type="button"
            className="text-sm text-emerald-600 hover:underline dark:text-emerald-400"
            onClick={onShowTags}
          >
            {group.tag_count} tag{group.tag_count === 1 ? "" : "s"}
          </button>
        </div>
        <div className="flex gap-1">
          <Button
            mode="text"
            variant="secondary"
            padding="p-1"
            aria-label={`Edit ${group.name}`}
            onClick={() => setEditing(true)}
          >
            <EditIcon className="h-5 w-5" />
          </Button>
          <Button
            mode="text"
            variant="danger"
            padding="p-1"
            aria-label={`Delete ${group.name}`}
            onClick={async () => {
              if (
                !window.confirm(
                  `Delete the group "${group.name}"? Its ${group.tag_count} tags become general tags, visible in every project.`,
                )
              )
                return;
              try {
                await api.tags.deleteGroup(group.id);
                toast.success("Group deleted");
                invalidate();
              } catch (error) {
                toast.error(apiErrorMessage(error, "Failed to delete group"));
              }
            }}
          >
            <DeleteIcon className="h-5 w-5" />
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1 text-xs">
        {group.project_keywords.length === 0 ? (
          <span className="italic text-stone-500">
            No keywords — never selected automatically.
          </span>
        ) : (
          group.project_keywords.map((keyword) => (
            <span
              key={keyword}
              className="rounded bg-stone-200 px-1.5 py-0.5 font-mono dark:bg-stone-700"
            >
              {keyword}
            </span>
          ))
        )}
      </div>
    </Card>
  );
}

export default function GroupsTab({
  groups,
  onShowTags,
}: {
  groups: TagGroup[];
  onShowTags: (groupId: number) => void;
}) {
  const [creating, setCreating] = useState(false);
  const invalidate = useInvalidateTagQueries();

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-sm text-stone-600 dark:text-stone-400">
        Groups sort tags by taxon. A project shows the tags of its group plus
        all general (ungrouped) tags. The group is picked from the project name
        using the keywords below, or set in the project overview.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {groups.map((group) => (
          <GroupCard
            key={group.id}
            group={group}
            onShowTags={() => onShowTags(group.id)}
          />
        ))}
        {creating ? (
            <Card>
              <GroupForm
                submitLabel="Create group"
                onCancel={() => setCreating(false)}
                onSubmit={async (name, keywords) => {
                  try {
                    await api.tags.createGroup({
                      name,
                      project_keywords: keywords,
                    });
                    toast.success(`Group "${name}" created`);
                    setCreating(false);
                    invalidate();
                  } catch (error) {
                    toast.error(apiErrorMessage(error, "Failed to create group"));
                  }
                }}
              />
            </Card>
          ) : (
            <button
              type="button"
              className="flex min-h-[8rem] items-center justify-center gap-2 rounded-md border border-dashed border-stone-300 text-stone-500 hover:border-emerald-500 hover:text-emerald-600 dark:border-stone-600"
              onClick={() => setCreating(true)}
            >
              <AddIcon className="h-5 w-5" /> New group
            </button>
          )}
      </div>
    </div>
  );
}
