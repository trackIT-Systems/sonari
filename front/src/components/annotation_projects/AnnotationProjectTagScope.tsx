import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import toast from "react-hot-toast";

import api from "@/app/api";
import Card from "@/components/Card";
import { H3 } from "@/components/Headings";
import Link from "@/components/Link";
import Tag from "@/components/tags/Tag";
import { SELECT_CLASS } from "@/components/tags/management/TagsTab";
import {
  PROJECT_TAG_SCOPE_KEY,
  apiErrorMessage,
  useProjectTags,
  useProjectTagScope,
  useTagGroups,
  useTagPresets,
} from "@/hooks/api/useTagManagement";

import type { AnnotationProjectUpdate } from "@/api/annotation_projects";
import type { AnnotationProject } from "@/types";

/** Encodes scope + id as one select value, e.g. "group:3". */
function currentValue(project: AnnotationProject): string {
  if (project.tag_scope === "group" && project.tag_group_id != null)
    return `group:${project.tag_group_id}`;
  if (project.tag_scope === "preset" && project.tag_preset_id != null)
    return `preset:${project.tag_preset_id}`;
  if (project.tag_scope === "all") return "all";
  return "auto";
}

function parseValue(value: string): AnnotationProjectUpdate {
  const [scope, id] = value.split(":");
  if (scope === "group") return { tag_scope: "group", tag_group_id: Number(id) };
  if (scope === "preset")
    return { tag_scope: "preset", tag_preset_id: Number(id) };
  return { tag_scope: scope as "auto" | "all" };
}

/** Lets the user choose which tags the project's tag search shows. */
export default function AnnotationProjectTagScope({
  annotationProject,
}: {
  annotationProject: AnnotationProject;
}) {
  const client = useQueryClient();
  const scope = useProjectTagScope(annotationProject.id);
  const tags = useProjectTags(annotationProject.id);
  const groups = useTagGroups();
  const presets = useTagPresets();
  const [value, setValue] = useState(() => currentValue(annotationProject));
  const [saving, setSaving] = useState(false);

  const detected =
    scope.data?.scope === "auto" ? scope.data.group?.name : undefined;

  const onChange = async (next: string) => {
    const previous = value;
    setValue(next);
    setSaving(true);
    try {
      await api.annotationProjects.update(annotationProject.id, parseValue(next));
      client.invalidateQueries({ queryKey: ["annotation_project"] });
      client.invalidateQueries({
        queryKey: [PROJECT_TAG_SCOPE_KEY, annotationProject.id],
      });
      client.invalidateQueries({ queryKey: ["tags"] });
      toast.success("Project tag set updated");
    } catch (error) {
      setValue(previous);
      toast.error(apiErrorMessage(error, "Failed to update tag set"));
    } finally {
      setSaving(false);
    }
  };

  let summary: string;
  if (scope.data == null) summary = "";
  else if (scope.data.scope === "all") summary = "The tag search shows all tags.";
  else if (scope.data.preset)
    summary = `The tag search shows the tags of the preset "${scope.data.preset.name}" and general tags.`;
  else if (scope.data.group)
    summary = `The tag search shows ${scope.data.group.name} tags and general tags.`;
  else
    summary =
      "No group matches the project name, so the tag search shows all tags.";

  const items = tags.data ?? [];

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <H3 className="!mb-0">Tag set</H3>
          <p className="text-sm text-stone-500">{summary}</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            className={SELECT_CLASS}
            aria-label="Project tag set"
            value={value}
            disabled={saving}
            onChange={(event) => onChange(event.target.value)}
          >
            <option value="auto">
              Automatic from project name
              {detected ? ` (${detected})` : ""}
            </option>
            <option value="all">All tags</option>
            {(groups.data ?? []).length > 0 && (
              <optgroup label="Group">
                {groups.data!.map((group) => (
                  <option key={group.id} value={`group:${group.id}`}>
                    {group.name}
                  </option>
                ))}
              </optgroup>
            )}
            {(presets.data ?? []).length > 0 && (
              <optgroup label="Preset">
                {presets.data!.map((preset) => (
                  <option key={preset.id} value={`preset:${preset.id}`}>
                    {preset.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <Link href="/tags" mode="text" variant="primary" className="text-sm">
            Manage tags
          </Link>
        </div>
      </div>
      <div>
        <p className="mb-1 text-xs font-medium text-stone-500">
          {tags.isLoading ? "Loading tags…" : `${items.length} tags`}
        </p>
        <div className="flex max-h-48 flex-wrap gap-1 overflow-y-auto">
          {items.map((tag) => (
            <Tag
              key={`${tag.key}:${tag.value}`}
              tag={tag}
              count={null}
              compact
              disabled
            />
          ))}
        </div>
      </div>
    </Card>
  );
}
