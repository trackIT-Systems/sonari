import { AxiosInstance } from "axios";
import { z } from "zod";

import { GetManySchema, Page } from "@/api/common";
import {
  AnnotationTaskSchema,
  RecordingSchema,
  SoundEventAnnotationSchema,
  StringFilterSchema,
  TagSchema,
} from "@/schemas";

import type { Tag } from "@/types";

const TagPageSchema = Page(TagSchema);

export type TagPage = z.infer<typeof TagPageSchema>;

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
});

export type TagFilter = z.input<typeof TagFilterSchema>;

const GetTagsQuerySchema = z.intersection(
  GetManySchema,
  TagFilterSchema,
);

export type GetTagsQuery = z.input<typeof GetTagsQuerySchema>;

const DEFAULT_ENDPOINTS = {
  get: "/api/v1/tags/",
  create: "/api/v1/tags/",
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
      },
    });
    return response.data;
  }

  async function createTag(data: TagCreate): Promise<Tag> {
    const response = await instance.post(endpoints.create, data);
    return TagSchema.parse(response.data);
  }

  return { get: getTags, create: createTag } as const;
}
