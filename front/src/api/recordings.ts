import { AxiosInstance } from "axios";
import { z } from "zod";

import { GetManySchema, Page } from "@/api/common";
import {
  DateFilterSchema,
  IntegerFilterSchema,
  NumberFilterSchema,
  RecordingSchema,
  TagSchema,
  TimeFilterSchema,
  TimeStringSchema,
} from "@/schemas";

import type { Feature, Recording, Tag } from "@/types";

const RecordingPageSchema = Page(RecordingSchema);

export type RecordingPage = z.infer<typeof RecordingPageSchema>;

const RecordingUpdateSchema = z.object({
  date: z.coerce.date().nullish(),
  time: TimeStringSchema.nullish(),
  latitude: z.number().nullish(),
  longitude: z.number().nullish(),
  rights: z.string().nullish(),
  time_expansion: z.coerce.number().optional(),
});

export type RecordingUpdate = z.input<typeof RecordingUpdateSchema>;

const RecordingFilterSchema = z.object({
  search: z.string().optional(),
  duration: NumberFilterSchema.optional(),
  samplerate: IntegerFilterSchema.optional(),
  channels: IntegerFilterSchema.optional(),
  time_expansion: NumberFilterSchema.optional(),
  latitude: NumberFilterSchema.optional(),
  longitude: NumberFilterSchema.optional(),
  tag: TagSchema.optional(),
  has_issues: z.boolean().optional(),
  date: DateFilterSchema.optional(),
  time: TimeFilterSchema.optional(),
});

const GetRecordingsQuerySchema = z.intersection(
  GetManySchema,
  RecordingFilterSchema,
);

export type GetRecordingsQuery = z.input<typeof GetRecordingsQuerySchema>;

const DEFAULT_ENDPOINTS = {
  getMany: "/api/v1/recordings/",
  get: "/api/v1/recordings/detail/",
  update: "/api/v1/recordings/detail/",
  delete: "/api/v1/recordings/detail/",
  addTag: "/api/v1/recordings/detail/tags/",
  removeTag: "/api/v1/recordings/detail/tags/",
  addFeature: "/api/v1/recordings/detail/features/",
  removeFeature: "/api/v1/recordings/detail/features/",
  updateFeature: "/api/v1/recordings/detail/features/",
};

export function registerRecordingAPI(
  instance: AxiosInstance,
  endpoints: typeof DEFAULT_ENDPOINTS = DEFAULT_ENDPOINTS,
) {
  async function getMany(query: GetRecordingsQuery): Promise<RecordingPage> {
    const params = GetRecordingsQuerySchema.parse(query);
    const { data } = await instance.get(endpoints.getMany, {
      params: {
        limit: params.limit,
        offset: params.offset,
        sort_by: params.sort_by,
        search: params.search,
        duration__gt: params.duration?.gt,
        duration__lt: params.duration?.lt,
        latitude__gt: params.latitude?.gt,
        latitude__lt: params.latitude?.lt,
        latitude__is_null: params.latitude?.is_null,
        longitude__gt: params.longitude?.gt,
        longitude__lt: params.longitude?.lt,
        longitude__is_null: params.longitude?.is_null,
        time_expansion__gt: params.time_expansion?.gt,
        time_expansion__lt: params.time_expansion?.lt,
        tag__key: params.tag?.key,
        tag__value: params.tag?.value,
        has_issues__eq: params.has_issues,
        date__before: params.date?.before,
        date__after: params.date?.after,
        date__on: params.date?.on,
        date__is_null: params.date?.is_null,
        time__before: params.time?.before,
        time__after: params.time?.after,
        time__is_null: params.time?.is_null,
      },
    });
    return RecordingPageSchema.parse(data);
  }

  async function get(id: number): Promise<Recording> {
    const { data } = await instance.get(endpoints.get, {
      params: { recording_id: id },
    });
    return RecordingSchema.parse(data);
  }

  async function update(
    recording: Recording,
    data: RecordingUpdate,
  ): Promise<Recording> {
    const body = RecordingUpdateSchema.parse(data);
    const { data: res } = await instance.patch(endpoints.update, body, {
      params: { recording_id: recording.id },
    });
    return RecordingSchema.parse(res);
  }

  async function deleteRecording(recording: Recording): Promise<Recording> {
    const { data: res } = await instance.delete(endpoints.delete, {
      params: { recording_id: recording.id },
    });
    return RecordingSchema.parse(res);
  }

  async function addTag(recording: Recording, tag: Tag): Promise<Recording> {
    const { data } = await instance.post(
      endpoints.addTag,
      {},
      {
        params: {
          recording_id: recording.id,
          key: tag.key,
          value: tag.value,
        },
      },
    );
    return RecordingSchema.parse(data);
  }

  async function removeTag(recording: Recording, tag: Tag): Promise<Recording> {
    const { data } = await instance.delete(endpoints.removeTag, {
      params: {
        recording_id: recording.id,
        key: tag.key,
        value: tag.value,
      },
    });
    return RecordingSchema.parse(data);
  }

  async function addFeature(
    recording: Recording,
    feature: Feature,
  ): Promise<Recording> {
    const { data } = await instance.post(
      endpoints.addFeature,
      {},
      {
        params: {
          recording_id: recording.id,
          name: feature.name,
          value: feature.value,
        },
      },
    );
    return RecordingSchema.parse(data);
  }

  async function removeFeature(
    recording: Recording,
    feature: Feature,
  ): Promise<Recording> {
    const { data } = await instance.delete(endpoints.removeFeature, {
      params: {
        recording_id: recording.id,
        name: feature.name,
        value: feature.value,
      },
    });
    return RecordingSchema.parse(data);
  }

  async function updateFeature(
    recording: Recording,
    feature: Feature,
  ): Promise<Recording> {
    const { data } = await instance.patch(
      endpoints.updateFeature,
      {},
      {
        params: {
          recording_id: recording.id,
          name: feature.name,
          value: feature.value,
        },
      },
    );
    return RecordingSchema.parse(data);
  }

  return {
    getMany,
    get,
    update,
    delete: deleteRecording,
    addTag,
    removeTag,
    addFeature,
    removeFeature,
    updateFeature,
  } as const;
}
