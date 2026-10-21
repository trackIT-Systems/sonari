import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import api from "@/app/api";

import type {
  ProjectTagScope,
  SpeciesTags,
  Tag,
  TagGroup,
  TagPreset,
} from "@/types";

export const TAG_GROUPS_KEY = ["tag_groups"] as const;
export const TAG_PRESETS_KEY = ["tag_presets"] as const;
export const TAG_DETAILS_KEY = "tag_details";
export const PROJECT_TAG_SCOPE_KEY = "annotation_project_tag_scope";
export const SPECIES_DUPLICATES_KEY = ["species_duplicates"] as const;
export const TAG_SHORTCUTS_KEY = ["tag_shortcuts"] as const;

/** Shortcut keys in keyboard order. */
export const SHORTCUT_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

export function useTagGroups() {
  return useQuery<TagGroup[]>({
    queryKey: TAG_GROUPS_KEY,
    queryFn: api.tags.getGroups,
    staleTime: 60_000,
  });
}

export function useTagPresets() {
  return useQuery<TagPreset[]>({
    queryKey: TAG_PRESETS_KEY,
    queryFn: api.tags.getPresets,
    staleTime: 60_000,
  });
}

/** Tags with a keyboard shortcut, shared by all users. */
export function useTagShortcuts() {
  return useQuery<Tag[]>({
    queryKey: TAG_SHORTCUTS_KEY,
    queryFn: api.tags.getShortcuts,
    staleTime: 60_000,
  });
}

/** Species named by several tags, e.g. species:Amsel and species:Turdus merula. */
export function useSpeciesDuplicates() {
  return useQuery<SpeciesTags[]>({
    queryKey: SPECIES_DUPLICATES_KEY,
    queryFn: api.tags.getSpeciesDuplicates,
  });
}

/** The group or preset that decides which tags a project shows. */
export function useProjectTagScope(annotationProjectId: number | null) {
  return useQuery<ProjectTagScope>({
    queryKey: [PROJECT_TAG_SCOPE_KEY, annotationProjectId],
    queryFn: () => api.annotationProjects.getTagScope(annotationProjectId!),
    enabled: annotationProjectId != null && annotationProjectId > 0,
    staleTime: 60_000,
  });
}

/**
 * Every tag the project's tag search offers: the tags of its group or preset
 * plus general tags. Refetches when the project's tag set changes.
 */
export function useProjectTags(annotationProjectId: number) {
  return useQuery<Tag[]>({
    queryKey: ["tags", "project", annotationProjectId],
    queryFn: async () =>
      (
        await api.tags.get({
          annotation_project_id: annotationProjectId,
          sort_by: "key",
          limit: 10000,
        })
      ).items,
    staleTime: 60_000,
  });
}

/** Human readable name of a project's tag scope, e.g. "Bat" or "German Bats". */
export function tagScopeLabel(scope: ProjectTagScope | undefined): string | null {
  if (scope == null) return null;
  if (scope.preset != null) return scope.preset.name;
  if (scope.group != null) return scope.group.name;
  return null;
}

/** The message of a failed API request (FastAPI `detail` or sonari `message`). */
export function apiErrorMessage(error: any, fallback: string): string {
  return (
    error?.response?.data?.detail ?? error?.response?.data?.message ?? fallback
  );
}

/** Invalidate every query that depends on tag groups, presets or tags. */
export function useInvalidateTagQueries() {
  const client = useQueryClient();
  return useCallback(() => {
    client.invalidateQueries({ queryKey: TAG_GROUPS_KEY });
    client.invalidateQueries({ queryKey: TAG_PRESETS_KEY });
    client.invalidateQueries({ queryKey: [TAG_DETAILS_KEY] });
    client.invalidateQueries({ queryKey: [PROJECT_TAG_SCOPE_KEY] });
    client.invalidateQueries({ queryKey: SPECIES_DUPLICATES_KEY });
    client.invalidateQueries({ queryKey: TAG_SHORTCUTS_KEY });
    client.invalidateQueries({ queryKey: ["tags"] });
  }, [client]);
}
