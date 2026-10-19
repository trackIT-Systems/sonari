import { AxiosInstance } from "axios";
import { z } from "zod";

import { GetManySchema, Page } from "@/api/common";
import {
  AnnotationTaskSchema,
  RecordingSchema,
  SoundEventAnnotationSchema,
  SpeciesTagsSchema,
  StringFilterSchema,
  TagDetailSchema,
  TagGroupSchema,
  TagPresetSchema,
  TagSchema,
} from "@/schemas";

import type { SpeciesTags, Tag, TagGroup, TagPreset } from "@/types";

const TagPageSchema = Page(TagSchema);

type TagPage = z.infer<typeof TagPageSchema>;

const TagCreateSchema = z.object({
  key: z.string(),
  value: z.string(),
});

export type TagCreate = z.input<typeof TagCreateSchema>;

const TagFilterSchema = z.object({
  search: z.string().optional(),
  key: z.string().optional(),
  value: StringFilterSchema.optional(),
  recording: RecordingSchema.optional(),
  sound_event_annotation: SoundEventAnnotationSchema.optional(),
  annotation_tasks: AnnotationTaskSchema.optional(),
  /** Only tags visible in this project (its tag group or preset). */
  annotation_project_id: z.number().int().optional(),
});

export type TagFilter = z.input<typeof TagFilterSchema>;

const GetTagsQuerySchema = z.intersection(
  GetManySchema,
  TagFilterSchema,
);

type GetTagsQuery = z.input<typeof GetTagsQuerySchema>;

const TagDetailPageSchema = Page(TagDetailSchema);

type TagDetailPage = z.infer<typeof TagDetailPageSchema>;

export type TagDetailQuery = {
  search?: string;
  /** A tag group id, or "none" for ungrouped tags. */
  group?: number | "none";
  /** One of key, value, usage, -usage. */
  sort_by?: string;
  limit?: number;
  offset?: number;
};

export type TagGroupCreate = {
  name: string;
  project_keywords: string[];
};

export type TagPresetCreate = {
  name: string;
  description?: string;
  group_id?: number | null;
  tag_ids: number[];
};

const TagMergeResultSchema = z.object({
  target: TagDetailSchema,
  merged_tags: z.number().int(),
  duplicates_removed: z.number().int(),
});

export type TagMergeResult = z.infer<typeof TagMergeResultSchema>;

const DEFAULT_ENDPOINTS = {
  get: "/api/v1/tags/",
  create: "/api/v1/tags/",
  manage: "/api/v1/tags/manage/",
  assignGroup: "/api/v1/tags/assign_group/",
  merge: "/api/v1/tags/merge/",
  shortcuts: "/api/v1/tags/shortcuts/",
  speciesDuplicates: "/api/v1/tags/species/duplicates/",
  groups: "/api/v1/tags/groups/",
  group: "/api/v1/tags/groups/detail/",
  presets: "/api/v1/tags/presets/",
  preset: "/api/v1/tags/presets/detail/",
};

export function registerTagAPI(
  instance: AxiosInstance,
  endpoints: typeof DEFAULT_ENDPOINTS = DEFAULT_ENDPOINTS,
) {
  async function getTags(query: GetTagsQuery): Promise<TagPage> {
    const params = GetTagsQuerySchema.parse(query);
    const response = await instance.get(endpoints.get, {
      params: {
        limit: params.limit,
        offset: params.offset,
        sort_by: params.sort_by,
        search: params.search,
        key__eq: params.key,
        value__eq: params.value?.eq,
        value__has: params.value?.has,
        recording__eq: params.recording?.id,
        sound_event_annotation__eq: params.sound_event_annotation?.id,
        annotation_project_id: params.annotation_project_id,
      },
    });
    return response.data;
  }

  /**
   * Create a tag. It joins `groupId`, or else the tag group of
   * `annotationProjectId`; a tag naming a catalog species joins the species'
   * group.
   */
  async function createTag(
    data: TagCreate,
    options: { annotationProjectId?: number; groupId?: number } = {},
  ): Promise<Tag> {
    const response = await instance.post(endpoints.create, data, {
      params: {
        annotation_project_id: options.annotationProjectId,
        group_id: options.groupId,
      },
    });
    return TagSchema.parse(response.data);
  }

  async function getTagDetails(query: TagDetailQuery): Promise<TagDetailPage> {
    const response = await instance.get(endpoints.manage, { params: query });
    return TagDetailPageSchema.parse(response.data);
  }

  async function assignGroup(
    tagIds: number[],
    groupId: number | null,
  ): Promise<number> {
    const response = await instance.post(endpoints.assignGroup, {
      tag_ids: tagIds,
      group_id: groupId,
    });
    return z.number().parse(response.data);
  }

  async function mergeTags(
    sourceTagIds: number[],
    targetTagId: number,
  ): Promise<TagMergeResult> {
    const response = await instance.post(endpoints.merge, {
      source_tag_ids: sourceTagIds,
      target_tag_id: targetTagId,
    });
    return TagMergeResultSchema.parse(response.data);
  }

  /** Tags with a keyboard shortcut (keys 0-9, shared by all users). */
  async function getShortcuts(): Promise<Tag[]> {
    const response = await instance.get(endpoints.shortcuts);
    return z.array(TagSchema).parse(response.data);
  }

  /** Give a key to a tag (taking it from its previous tag), or free it with null. */
  async function setShortcut(
    shortcut: string,
    tagId: number | null,
  ): Promise<Tag[]> {
    const response = await instance.put(endpoints.shortcuts, {
      shortcut,
      tag_id: tagId,
    });
    return z.array(TagSchema).parse(response.data);
  }

  /** Species named by several tags (e.g. German and Latin), to merge. */
  async function getSpeciesDuplicates(): Promise<SpeciesTags[]> {
    const response = await instance.get(endpoints.speciesDuplicates);
    return z.array(SpeciesTagsSchema).parse(response.data);
  }

  async function getGroups(): Promise<TagGroup[]> {
    const response = await instance.get(endpoints.groups);
    return z.array(TagGroupSchema).parse(response.data);
  }

  async function createGroup(data: TagGroupCreate): Promise<TagGroup> {
    const response = await instance.post(endpoints.groups, data);
    return TagGroupSchema.parse(response.data);
  }

  async function updateGroup(
    id: number,
    data: Partial<TagGroupCreate>,
  ): Promise<TagGroup> {
    const response = await instance.patch(endpoints.group, data, {
      params: { tag_group_id: id },
    });
    return TagGroupSchema.parse(response.data);
  }

  async function deleteGroup(id: number): Promise<void> {
    await instance.delete(endpoints.group, { params: { tag_group_id: id } });
  }

  async function getPresets(): Promise<TagPreset[]> {
    const response = await instance.get(endpoints.presets);
    return z.array(TagPresetSchema).parse(response.data);
  }

  async function createPreset(data: TagPresetCreate): Promise<TagPreset> {
    const response = await instance.post(endpoints.presets, data);
    return TagPresetSchema.parse(response.data);
  }

  async function updatePreset(
    id: number,
    data: Partial<TagPresetCreate>,
  ): Promise<TagPreset> {
    const response = await instance.patch(endpoints.preset, data, {
      params: { tag_preset_id: id },
    });
    return TagPresetSchema.parse(response.data);
  }

  async function deletePreset(id: number): Promise<void> {
    await instance.delete(endpoints.preset, { params: { tag_preset_id: id } });
  }

  return {
    get: getTags,
    create: createTag,
    getDetails: getTagDetails,
    assignGroup,
    merge: mergeTags,
    getShortcuts,
    setShortcut,
    getSpeciesDuplicates,
    getGroups,
    createGroup,
    updateGroup,
    deleteGroup,
    getPresets,
    createPreset,
    updatePreset,
    deletePreset,
  } as const;
}
