import { AxiosInstance } from "axios";
import { z } from "zod";

import { GetManySchema, Page } from "@/api/common";
import {
  AnnotationProjectSchema,
  AnnotationTaskSchema,
  DatasetSchema,
  TagSchema,
  UserSchema,
  FloatEqFilterSchema,
} from "@/schemas";

import type { NoteCreate } from "@/api/notes";
import type {
  AnnotationStatus,
  AnnotationTask,
  Note,
  Tag,
} from "@/types";

import { formatDateForAPI } from "@/components/filters/DateRangeFilter";

const AnnotationTaskPageSchema = Page(AnnotationTaskSchema);

export type AnnotationTaskPage = z.infer<typeof AnnotationTaskPageSchema>;

const AnnotationTaskFilterSchema = z.object({
  dataset: z.union([
    DatasetSchema,
    z.array(DatasetSchema)
  ]).optional(),
  annotation_project: AnnotationProjectSchema.optional(),
  annotation_task_tag: TagSchema.optional(),
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
  sound_event_annotation_min_frequency: z.object({
    gt: z.number().optional(),
    lt: z.number().optional(),
  }).optional(),
  sound_event_annotation_max_frequency: z.object({
    gt: z.number().optional(),
    lt: z.number().optional(),
  }).optional(),
  include_recording: z.boolean().optional(),
  include_annotation_project: z.boolean().optional(),
  include_sound_event_annotations: z.boolean().optional(),
  include_sound_event_tags: z.boolean().optional(),
  include_tags: z.boolean().optional(),
  include_notes: z.boolean().optional(),
  include_features: z.boolean().optional(),
  include_status_badges: z.boolean().optional(),
  include_status_badge_users: z.boolean().optional(),
  include_sound_event_annotation_features: z.boolean().optional(),
  include_sound_event_annotation_users: z.boolean().optional(),
  include_note_users: z.boolean().optional(),
});

export type AnnotationTaskFilter = z.input<typeof AnnotationTaskFilterSchema>;

const GetAnnotationTasksQuerySchema = z.intersection(
  GetManySchema,
  AnnotationTaskFilterSchema,
);

type GetAnnotationTasksQuery = z.input<
  typeof GetAnnotationTasksQuerySchema
>;

const DEFAULT_ENDPOINTS = {
  getMany: "/api/v1/annotation_tasks/",
  get: "/api/v1/annotation_tasks/detail/",
  delete: "/api/v1/annotation_tasks/detail/",
  addBadge: "/api/v1/annotation_tasks/detail/badges/",
  removeBadge: "/api/v1/annotation_tasks/detail/badges/",
  addNote:  "/api/v1/annotation_tasks/detail/notes/",
  removeNote:  "/api/v1/annotation_tasks/detail/notes/",
  addTag:  "/api/v1/annotation_tasks/detail/tags/",
  removeTag:  "/api/v1/annotation_tasks/detail/tags/",
};

export function registerAnnotationTasksAPI(
  instance: AxiosInstance,
  endpoints: typeof DEFAULT_ENDPOINTS = DEFAULT_ENDPOINTS,
) {

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
            ? params.dataset.map(d => d.id).join(',')
            : params.dataset.id)
          : undefined,
        annotation_project__eq: params.annotation_project?.id,
        annotation_task_tag__key: params.annotation_task_tag?.key,
        annotation_task_tag__value: params.annotation_task_tag?.value,
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
        empty__eq: params.empty,
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
        sound_event_annotation_min_frequency__gt: params.sound_event_annotation_min_frequency?.gt,
        sound_event_annotation_min_frequency__lt: params.sound_event_annotation_min_frequency?.lt,
        sound_event_annotation_max_frequency__gt: params.sound_event_annotation_max_frequency?.gt,
        sound_event_annotation_max_frequency__lt: params.sound_event_annotation_max_frequency?.lt,
        night__eq: params.night?.eq,
        night__tz: params.night?.timezone,
        day__eq: params.day?.eq,
        day__tz: params.day?.timezone,
        sample__eq: params.sample?.eq,
        include_recording: params.include_recording,
        include_annotation_project: params.include_annotation_project,
        include_sound_event_annotations: params.include_sound_event_annotations,
        include_sound_event_tags: params.include_sound_event_tags,
        include_tags: params.include_tags,
        include_notes: params.include_notes,
        include_features: params.include_features,
        include_status_badges: params.include_status_badges,
        include_status_badge_users: params.include_status_badge_users,
        include_sound_event_annotation_features: params.include_sound_event_annotation_features,
        include_sound_event_annotation_users: params.include_sound_event_annotation_users,
        include_note_users: params.include_note_users,
      },
    });
    return AnnotationTaskPageSchema.parse(response.data);
  }

  async function getAnnotationTask(
    id: number,
    includes?: {
      recording?: boolean;
      annotation_project?: boolean;
      sound_event_annotations?: boolean;
      sound_event_tags?: boolean;
      tags?: boolean;
      notes?: boolean;
      features?: boolean;
      status_badges?: boolean;
      status_badge_users?: boolean;
      sound_event_annotation_features?: boolean;
      sound_event_annotation_users?: boolean;
      note_users?: boolean;
    }
  ): Promise<AnnotationTask> {
    const response = await instance.get(endpoints.get, {
      params: {
        annotation_task_id: id,
        include_recording: includes?.recording,
        include_annotation_project: includes?.annotation_project,
        include_sound_event_annotations: includes?.sound_event_annotations,
        include_sound_event_tags: includes?.sound_event_tags,
        include_tags: includes?.tags,
        include_notes: includes?.notes,
        include_features: includes?.features,
        include_status_badges: includes?.status_badges,
        include_status_badge_users: includes?.status_badge_users,
        include_sound_event_annotation_features: includes?.sound_event_annotation_features,
        include_sound_event_annotation_users: includes?.sound_event_annotation_users,
        include_note_users: includes?.note_users,
      },
    });
    return AnnotationTaskSchema.parse(response.data);
  }

  async function deleteAnnotationTask(
    annotationTask: AnnotationTask,
  ): Promise<AnnotationTask> {
    const response = await instance.delete(endpoints.delete, {
      params: {
        annotation_task_id: annotationTask.id,
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
          annotation_task_id: annotationTask.id,
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
        annotation_task_id: annotationTask.id,
        state,
        user_id: userId,
      },
    });
    return AnnotationTaskSchema.parse(response.data);
  }


  async function addNote(
    annotationTask: AnnotationTask,
    data: NoteCreate,
  ): Promise<AnnotationTask> {
    const response = await instance.post(endpoints.addNote, data, {
      params: {
        annotation_task_id: annotationTask.id,
      },
    });
    return AnnotationTaskSchema.parse(response.data);
  }

  async function removeNote(
    annotationTask: AnnotationTask,
    note: Note,
  ): Promise<AnnotationTask> {
    const response = await instance.delete(endpoints.removeNote, {
      params: {
        annotation_task_id: annotationTask.id,
        note_id: note.id,
      },
    });
    return AnnotationTaskSchema.parse(response.data);
  }

  async function addTag(
    annotationTask: AnnotationTask,
    tag: Tag,
  ): Promise<AnnotationTask> {
    const response = await instance.post(endpoints.addTag, {
      params: {
        annotation_task_id: annotationTask.id,
        tag,
      },
    });
    return AnnotationTaskSchema.parse(response.data);
  }

  async function removeTag(
    annotationTask: AnnotationTask,
    tag: Tag,
  ): Promise<AnnotationTask> {
    const response = await instance.delete(endpoints.removeTag, {
      params: {
        annotation_task_id: annotationTask.id,
        tag,
      },
    });
    return AnnotationTaskSchema.parse(response.data);
  }
  

  return {
    getMany,
    get: getAnnotationTask,
    delete: deleteAnnotationTask,
    addBadge,
    removeBadge,
    addNote,
    removeNote,
    addTag,
    removeTag,
  } as const;
}
