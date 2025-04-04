import { AxiosInstance } from "axios";
import { z } from "zod";

import { GetManySchema, Page } from "@/api/common";
import {
  AnnotationProjectSchema,
  AnnotationTaskSchema,
  ClipAnnotationSchema,
  DatasetSchema,
  TagSchema,
  UserSchema,
  FloatEqFilterSchema,
} from "@/schemas";

import type {
  AnnotationProject,
  AnnotationStatus,
  AnnotationTask,
  Clip,
  ClipAnnotation,
} from "@/types";

import { formatDateForAPI } from "@/components/filters/DateRangeFilter";

export const AnnotationTaskPageSchema = Page(AnnotationTaskSchema);

export type AnnotationTaskPage = z.infer<typeof AnnotationTaskPageSchema>;

export const AnnotationTaskFilterSchema = z.object({
  dataset: z.union([
    DatasetSchema,
    z.array(DatasetSchema)
  ]).optional(),
  annotation_project: AnnotationProjectSchema.optional(),
  recording_tag: TagSchema.optional(),
  sound_event_annotation_tag: z.union([
    TagSchema,
    z.array(TagSchema)
  ]).optional(),
  empty: z.boolean().optional(),
  pending: z.boolean().optional(),
  assigned: z.boolean().optional(),
  verified: z.boolean().optional(),
  rejected: z.boolean().optional(),
  completed: z.boolean().optional(),
  assigned_to: UserSchema.optional(),
  search_recordings: z.string().optional(),
  date_range: z.union([
    z.object({
      start_date: z.date().nullish(),
      end_date: z.date().nullish(),
      start_time: z.date().nullish(),
      end_time: z.date().nullish(),
    }),
    z.array(
      z.object({
        start_date: z.date().nullish(),
        end_date: z.date().nullish(),
        start_time: z.date().nullish(),
        end_time: z.date().nullish(),
      })
    )
  ]).optional(),
  night: z.object({
    eq: z.boolean(),
    timezone: z.string(),
  }).optional(),
  day: z.object({
    eq: z.boolean(),
    timezone: z.string(),
  }).optional(),
  sample: FloatEqFilterSchema.optional(),
  detection_confidence: z.object({
    gt: z.number().optional(),
    lt: z.number().optional(),
  }).optional(),
  species_confidence: z.object({
    gt: z.number().optional(),
    lt: z.number().optional(),
  }).optional(),
});

export type AnnotationTaskFilter = z.input<typeof AnnotationTaskFilterSchema>;

export const GetAnnotationTasksQuerySchema = z.intersection(
  GetManySchema,
  AnnotationTaskFilterSchema,
);

export type GetAnnotationTasksQuery = z.input<
  typeof GetAnnotationTasksQuerySchema
>;

const DEFAULT_ENDPOINTS = {
  createMany: "/api/v1/annotation_tasks/",
  getMany: "/api/v1/annotation_tasks/",
  get: "/api/v1/annotation_tasks/detail/",
  getAnnotations: "/api/v1/annotation_tasks/detail/clip_annotation/",
  delete: "/api/v1/annotation_tasks/detail/",
  addBadge: "/api/v1/annotation_tasks/detail/badges/",
  removeBadge: "/api/v1/annotation_tasks/detail/badges/",
};

export function registerAnnotationTasksAPI(
  instance: AxiosInstance,
  endpoints: typeof DEFAULT_ENDPOINTS = DEFAULT_ENDPOINTS,
) {
  async function createMany(
    annotationProject: AnnotationProject,
    clips: Clip[],
  ): Promise<AnnotationTask[]> {
    const response = await instance.post(
      endpoints.createMany,
      clips.map((clip) => clip.uuid),
      {
        params: {
          annotation_project_uuid: annotationProject.uuid,
        },
      },
    );
    return z.array(AnnotationTaskSchema).parse(response.data);
  }

  async function getMany(
    query: GetAnnotationTasksQuery,
  ): Promise<AnnotationTaskPage> {
    const params = GetAnnotationTasksQuerySchema.parse(query);

    const response = await instance.get(endpoints.getMany, {
      params: {
        limit: params.limit,
        offset: params.offset,
        sort_by: params.sort_by,
        dataset__lst: params.dataset
          ? (Array.isArray(params.dataset)
            ? params.dataset.map(d => d.uuid).join(',')
            : params.dataset.uuid)
          : undefined,
        annotation_project__eq: params.annotation_project?.uuid,
        recording_tag__key: params.recording_tag?.key,
        recording_tag__value: params.recording_tag?.value,
        sound_event_annotation_tag__keys: params.sound_event_annotation_tag
          ? (Array.isArray(params.sound_event_annotation_tag)
            ? params.sound_event_annotation_tag.map(t => t.key).join(',')
            : params.sound_event_annotation_tag.key)
          : undefined,
        sound_event_annotation_tag__values: params.sound_event_annotation_tag
          ? (Array.isArray(params.sound_event_annotation_tag)
            ? params.sound_event_annotation_tag.map(t => t.value).join(',')
            : params.sound_event_annotation_tag.value)
          : undefined,
        pending__eq: params.pending,
        assigned__eq: params.assigned,
        verified__eq: params.verified,
        rejected__eq: params.rejected,
        completed__eq: params.completed,
        assigned_to__eq: params.assigned_to?.id,
        search_recordings: params.search_recordings,
        date__start_dates: params.date_range
          ? (Array.isArray(params.date_range)
            ? params.date_range.map(d => formatDateForAPI(d.start_date)).join(',')
            : formatDateForAPI(params.date_range.start_date))
          : undefined,
        date__end_dates: params.date_range
          ? (Array.isArray(params.date_range)
            ? params.date_range.map(d => formatDateForAPI(d.end_date)).join(',')
            : formatDateForAPI(params.date_range.end_date))
          : undefined,
        date__start_times: params.date_range
          ? (Array.isArray(params.date_range)
            ? params.date_range.map(d => formatDateForAPI(d.start_time)).join(',')
            : formatDateForAPI(params.date_range.start_time))
          : undefined,
        date__end_times: params.date_range
          ? (Array.isArray(params.date_range)
            ? params.date_range.map(d => formatDateForAPI(d.end_time)).join(',')
            : formatDateForAPI(params.date_range.end_time))
          : undefined,
        detection_confidence__gt: params.detection_confidence?.gt,
        detection_confidence__lt: params.detection_confidence?.lt,
        species_confidence__gt: params.species_confidence?.gt,
        species_confidence__lt: params.species_confidence?.lt,
        night__eq: params.night?.eq,
        night__tz: params.night?.timezone,
        day__eq: params.day?.eq,
        day__tz: params.day?.timezone,
        sample__eq: params.sample?.eq,
      },
    });
    return AnnotationTaskPageSchema.parse(response.data);
  }

  async function getAnnotationTask(uuid: string): Promise<AnnotationTask> {
    const response = await instance.get(endpoints.get, {
      params: { annotation_task_uuid: uuid },
    });
    return AnnotationTaskSchema.parse(response.data);
  }

  async function getTaskAnnotations(
    annotationTask: AnnotationTask,
  ): Promise<ClipAnnotation> {
    const response = await instance.get(endpoints.getAnnotations, {
      params: {
        annotation_task_uuid: annotationTask.uuid,
      },
    });
    return ClipAnnotationSchema.parse(response.data);
  }

  async function deleteAnnotationTask(
    annotationTask: AnnotationTask,
  ): Promise<AnnotationTask> {
    const response = await instance.delete(endpoints.delete, {
      params: {
        annotation_task_uuid: annotationTask.uuid,
      },
    });
    return AnnotationTaskSchema.parse(response.data);
  }

  async function addBadge(
    annotationTask: AnnotationTask,
    state: AnnotationStatus,
  ): Promise<AnnotationTask> {
    const response = await instance.post(
      endpoints.addBadge,
      {},
      {
        params: {
          annotation_task_uuid: annotationTask.uuid,
          state,
        },
      },
    );
    return AnnotationTaskSchema.parse(response.data);
  }

  async function removeBadge(
    annotationTask: AnnotationTask,
    state: AnnotationStatus,
    userId?: string,
  ): Promise<AnnotationTask> {
    const response = await instance.delete(endpoints.removeBadge, {
      params: {
        annotation_task_uuid: annotationTask.uuid,
        state,
        user_id: userId,
      },
    });
    return AnnotationTaskSchema.parse(response.data);
  }

  return {
    createMany,
    getMany,
    get: getAnnotationTask,
    getAnnotations: getTaskAnnotations,
    delete: deleteAnnotationTask,
    addBadge,
    removeBadge,
  } as const;
}
