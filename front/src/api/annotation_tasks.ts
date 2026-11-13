import { AxiosInstance } from "axios";
import { z } from "zod";

import { GetManySchema, Page, type Paginated } from "@/api/common";
import {
  AnnotationProjectSchema,
  AnnotationTaskSchema,
  DatasetSchema,
  GeometrySchema,
  TagSchema,
  UserSchema,
  FloatEqFilterSchema,
  IntegerFilterSchema,
} from "@/schemas";

import type { NoteCreate } from "@/api/notes";
import type {
  AnnotationStatus,
  AnnotationTask,
  AnnotationTaskIndex,
  AnnotationTaskNight,
  AnnotationTaskNightTotal,
  AnnotationTaskStats,
  Note,
  Tag,
} from "@/types";

import { formatDateForAPI } from "@/components/filters/DateRangeFilter";

// Coerce date_range field from preset/URL (string or Date) to Date for schema and API
const TIME_ONLY_REGEX = /^\d{1,2}:\d{2}(:\d{2})?$/;
function coerceDateRangeField(
  value: Date | string | number | null | undefined
): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "string") {
    if (TIME_ONLY_REGEX.test(value)) {
      const [h, m, sec = "0"] = value.split(":");
      return new Date(Date.UTC(1970, 0, 1, parseInt(h, 10), parseInt(m, 10), parseInt(sec, 10)));
    }
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

const AnnotationTaskPageSchema = Page(AnnotationTaskSchema);

export type AnnotationTaskPage = z.infer<typeof AnnotationTaskPageSchema>;

const AnnotationTaskIndexSchema = z.object({
  id: z.number(),
  recording_id: z.number(),
  start_time: z.number(),
});

const AnnotationTaskIndexPageSchema = Page(AnnotationTaskIndexSchema);

export type AnnotationTaskIndexPage = z.infer<typeof AnnotationTaskIndexPageSchema>;

/** Tag entry in task filters; `exclude` hides tasks with that tag. */
const SoundEventAnnotationTaskFilterTagSchema = TagSchema.extend({
  exclude: z.boolean().optional(),
});

const AnnotationTaskFilterSchema = z.object({
  dataset: z.union([
    DatasetSchema,
    z.array(DatasetSchema)
  ]).optional(),
  annotation_project: AnnotationProjectSchema.optional(),
  annotation_task_tag: TagSchema.optional(),
  sound_event_annotation_tag: z.union([
    SoundEventAnnotationTaskFilterTagSchema,
    z.array(SoundEventAnnotationTaskFilterTagSchema),
  ]).optional(),
  /** How multiple included tags combine (default OR when omitted). */
  sound_event_annotation_tag_include_match: z.enum(["and", "or"]).optional(),
  /** Number of distinct tags on the task's sound events (set from the Sound event tags filter UI). */
  sound_event_annotation_tag_count: IntegerFilterSchema.optional(),
  /** Number of sound event annotations on the task (set from the Tag filter UI). */
  sound_event_annotation_count: IntegerFilterSchema.optional(),
  /** Tags on the task itself, included or excluded (task tags filter). */
  task_tag: z.union([
    SoundEventAnnotationTaskFilterTagSchema,
    z.array(SoundEventAnnotationTaskFilterTagSchema),
  ]).optional(),
  /** How multiple included task tags combine (default OR when omitted). */
  task_tag_include_match: z.enum(["and", "or"]).optional(),
  /** Number of distinct tags on the task itself (set from the Task tags filter UI). */
  task_tag_count: IntegerFilterSchema.optional(),
  empty: z.boolean().optional(),
  pending: z.boolean().optional(),
  assigned: z.boolean().optional(),
  verified: z.boolean().optional(),
  rejected: z.boolean().optional(),
  completed: z.boolean().optional(),
  assigned_to: UserSchema.optional(),
  search_recordings: z.string().optional(),
  /** Only these tasks, e.g. the rows ticked in the tasks table ("annotate selection"). */
  annotation_task_ids: z.array(z.number().int()).optional(),
  sort_by: z.string().optional(),
  date_range: z
    .union([
      z.object({
        start_date: z
          .union([z.date(), z.string(), z.number()])
          .nullish()
          .transform(coerceDateRangeField),
        end_date: z
          .union([z.date(), z.string(), z.number()])
          .nullish()
          .transform(coerceDateRangeField),
        start_time: z
          .union([z.date(), z.string(), z.number()])
          .nullish()
          .transform(coerceDateRangeField),
        end_time: z
          .union([z.date(), z.string(), z.number()])
          .nullish()
          .transform(coerceDateRangeField),
      }),
      z.array(
        z.object({
          start_date: z
            .union([z.date(), z.string(), z.number()])
            .nullish()
            .transform(coerceDateRangeField),
          end_date: z
            .union([z.date(), z.string(), z.number()])
            .nullish()
            .transform(coerceDateRangeField),
          start_time: z
            .union([z.date(), z.string(), z.number()])
            .nullish()
            .transform(coerceDateRangeField),
          end_time: z
            .union([z.date(), z.string(), z.number()])
            .nullish()
            .transform(coerceDateRangeField),
        })
      ),
    ])
    .optional(),
  night: z.object({
    eq: z.boolean(),
    timezone: z.string(),
  }).optional(),
  day: z.object({
    eq: z.boolean(),
    timezone: z.string(),
  }).optional(),
  sample: FloatEqFilterSchema.optional(),
  /** The tasks of one night: noon to noon local time, named by its evening ("none": no recording date) */
  recording_night: z.object({
    night: z.string(),
    utc_offset: z.number().int(),
  }).optional(),
  recording: z.object({
    eq: z.number().optional(),
  }).optional(),
  confidence: z.object({
    gt: z.number().optional(),
    lt: z.number().optional(),
  }).optional(),
  median_confidence: z.object({
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

type ParsedAnnotationTaskFilter = z.infer<typeof AnnotationTaskFilterSchema>;

function tagFilterEntriesForApi(
  tags: ParsedAnnotationTaskFilter["sound_event_annotation_tag"],
) {
  if (tags == null) {
    return {
      includeKeys: undefined as string | undefined,
      includeValues: undefined as string | undefined,
      excludeKeys: undefined as string | undefined,
      excludeValues: undefined as string | undefined,
    };
  }
  const list = Array.isArray(tags) ? tags : [tags];
  const include = list.filter((t) => !t.exclude);
  const exclude = list.filter((t) => t.exclude);
  return {
    includeKeys:
      include.length > 0 ? include.map((t) => t.key).join(",") : undefined,
    includeValues:
      include.length > 0 ? include.map((t) => t.value).join(",") : undefined,
    excludeKeys:
      exclude.length > 0 ? exclude.map((t) => t.key).join(",") : undefined,
    excludeValues:
      exclude.length > 0 ? exclude.map((t) => t.value).join(",") : undefined,
  };
}

export function buildAnnotationTaskFilterQueryParams(
  filter: AnnotationTaskFilter,
): Record<string, string | number | boolean | undefined> {
  const params = AnnotationTaskFilterSchema.parse(filter) as ParsedAnnotationTaskFilter;
  const soundEventTags = tagFilterEntriesForApi(
    params.sound_event_annotation_tag,
  );
  const taskTags = tagFilterEntriesForApi(params.task_tag);

  return {
    dataset__lst: params.dataset
      ? (Array.isArray(params.dataset)
        ? params.dataset.map((d) => d.id).join(",")
        : params.dataset.id)
      : undefined,
    annotation_project__eq: params.annotation_project?.id,
    annotation_task_tag__key: params.annotation_task_tag?.key,
    annotation_task_tag__value: params.annotation_task_tag?.value,
    sound_event_annotation_tag__keys: soundEventTags.includeKeys,
    sound_event_annotation_tag__values: soundEventTags.includeValues,
    sound_event_annotation_tag__exclude_keys: soundEventTags.excludeKeys,
    sound_event_annotation_tag__exclude_values: soundEventTags.excludeValues,
    sound_event_annotation_tag__include_match:
      params.sound_event_annotation_tag_include_match,
    sound_event_annotation_tag_count__eq:
      params.sound_event_annotation_tag_count?.eq,
    sound_event_annotation_tag_count__gt:
      params.sound_event_annotation_tag_count?.gt,
    sound_event_annotation_tag_count__lt:
      params.sound_event_annotation_tag_count?.lt,
    sound_event_annotation_tag_count__ge:
      params.sound_event_annotation_tag_count?.ge,
    sound_event_annotation_tag_count__le:
      params.sound_event_annotation_tag_count?.le,
    task_tag__keys: taskTags.includeKeys,
    task_tag__values: taskTags.includeValues,
    task_tag__exclude_keys: taskTags.excludeKeys,
    task_tag__exclude_values: taskTags.excludeValues,
    task_tag__include_match: params.task_tag_include_match,
    task_tag_count__eq: params.task_tag_count?.eq,
    task_tag_count__gt: params.task_tag_count?.gt,
    task_tag_count__lt: params.task_tag_count?.lt,
    task_tag_count__ge: params.task_tag_count?.ge,
    task_tag_count__le: params.task_tag_count?.le,
    sound_event_annotation_count__eq:
      params.sound_event_annotation_count?.eq,
    sound_event_annotation_count__gt:
      params.sound_event_annotation_count?.gt,
    sound_event_annotation_count__lt:
      params.sound_event_annotation_count?.lt,
    sound_event_annotation_count__ge:
      params.sound_event_annotation_count?.ge,
    sound_event_annotation_count__le:
      params.sound_event_annotation_count?.le,
    pending__eq: params.pending,
    empty__eq: params.empty,
    assigned__eq: params.assigned,
    verified__eq: params.verified,
    rejected__eq: params.rejected,
    completed__eq: params.completed,
    assigned_to__eq: params.assigned_to?.id,
    search_recordings: params.search_recordings,
    id__lst: params.annotation_task_ids?.length ? params.annotation_task_ids.join(",") : undefined,
    date__start_dates: params.date_range
      ? (Array.isArray(params.date_range)
        ? params.date_range.map((d) => formatDateForAPI(d.start_date)).join(",")
        : formatDateForAPI(params.date_range.start_date))
      : undefined,
    date__end_dates: params.date_range
      ? (Array.isArray(params.date_range)
        ? params.date_range.map((d) => formatDateForAPI(d.end_date)).join(",")
        : formatDateForAPI(params.date_range.end_date))
      : undefined,
    date__start_times: params.date_range
      ? (Array.isArray(params.date_range)
        ? params.date_range.map((d) => formatDateForAPI(d.start_time)).join(",")
        : formatDateForAPI(params.date_range.start_time))
      : undefined,
    date__end_times: params.date_range
      ? (Array.isArray(params.date_range)
        ? params.date_range.map((d) => formatDateForAPI(d.end_time)).join(",")
        : formatDateForAPI(params.date_range.end_time))
      : undefined,
    confidence__gt: params.confidence?.gt,
    confidence__lt: params.confidence?.lt,
    median_confidence__gt: params.median_confidence?.gt,
    median_confidence__lt: params.median_confidence?.lt,
    sound_event_annotation_min_frequency__gt: params.sound_event_annotation_min_frequency?.gt,
    sound_event_annotation_min_frequency__lt: params.sound_event_annotation_min_frequency?.lt,
    sound_event_annotation_max_frequency__gt: params.sound_event_annotation_max_frequency?.gt,
    sound_event_annotation_max_frequency__lt: params.sound_event_annotation_max_frequency?.lt,
    night__eq: params.night?.eq,
    night__tz: params.night?.timezone,
    day__eq: params.day?.eq,
    day__tz: params.day?.timezone,
    sample__eq: params.sample?.eq,
    recording__eq: params.recording?.eq,
    recording_night__eq: params.recording_night?.night,
    recording_night__utc_offset: params.recording_night?.utc_offset,
  };
}

const GetAnnotationTasksQuerySchema = z.intersection(
  GetManySchema,
  AnnotationTaskFilterSchema,
);

type GetAnnotationTasksQuery = z.input<
  typeof GetAnnotationTasksQuerySchema
>;

const AnnotationTaskBulkFailureSchema = z.object({
  annotation_task_id: z.number(),
  message: z.string(),
});

export const AnnotationTaskBulkResultSchema = z.object({
  tasks_targeted: z.number(),
  tasks_updated: z.number(),
  tasks_skipped: z.number(),
  sound_events_updated: z.number(),
  sound_events_skipped: z.number().default(0),
  failures: z.array(AnnotationTaskBulkFailureSchema),
});

export type AnnotationTaskBulkResult = z.infer<typeof AnnotationTaskBulkResultSchema>;

const SoundEventTagBulkCountSchema = z.object({
  key: z.string(),
  value: z.string(),
  count: z.number(),
});

export type SoundEventTagBulkCount = z.infer<typeof SoundEventTagBulkCountSchema>;

const SoundEventVersionTagSchema = z.object({
  key: z.string(),
  value: z.string(),
  /** Detector confidence for this tag, if the version had one. */
  confidence: z.number().nullish(),
});

/** An old state of a sound event, replaced by an edit or ended by a delete. */
const SoundEventVersionSchema = z.object({
  id: z.number(),
  /** The event's id; null for GUANO predictions whose event was already gone. */
  version_of_id: z.number().nullish(),
  annotation_task_id: z.number(),
  geometry_type: z.string(),
  geometry: GeometrySchema,
  tags: z.array(SoundEventVersionTagSchema),
  created_by_id: z.string().nullish(),
  created_by_username: z.string().nullish(),
  created_on: z.coerce.date(),
  /** Edit session that produced this state; null for imports. */
  edit_id: z.string().nullish(),
  superseded_on: z.coerce.date(),
  superseded_by_id: z.string().nullish(),
  superseded_by_username: z.string().nullish(),
  /** Edit session that replaced this state; null for GUANO versions. */
  superseded_edit_id: z.string().nullish(),
  version_reason: z.enum(["edited", "deleted", "guano"]),
});

/** When a live sound event got its current state. */
const SoundEventLiveStateSchema = z.object({
  id: z.number(),
  edit_id: z.string().nullish(),
  created_on: z.coerce.date(),
  created_by_username: z.string().nullish(),
});

export const SoundEventTaskHistorySchema = z.object({
  annotation_task_id: z.number(),
  versions: z.array(SoundEventVersionSchema),
  live: z.array(SoundEventLiveStateSchema),
});

export type SoundEventVersion = z.infer<typeof SoundEventVersionSchema>;
export type SoundEventLiveState = z.infer<typeof SoundEventLiveStateSchema>;
export type SoundEventTaskHistory = z.infer<typeof SoundEventTaskHistorySchema>;

const DEFAULT_ENDPOINTS = {
  getMany: "/api/v1/annotation_tasks/",
  getIndex: "/api/v1/annotation_tasks/index",
  getStats: "/api/v1/annotation_tasks/stats",
  getNights: "/api/v1/annotation_tasks/nights/",
  getNightStats: "/api/v1/annotation_tasks/nights/stats/",
  get: "/api/v1/annotation_tasks/detail/",
  delete: "/api/v1/annotation_tasks/detail/",
  addBadge: "/api/v1/annotation_tasks/detail/badges/",
  removeBadge: "/api/v1/annotation_tasks/detail/badges/",
  addNote:  "/api/v1/annotation_tasks/detail/notes/",
  removeNote:  "/api/v1/annotation_tasks/detail/notes/",
  addTag:  "/api/v1/annotation_tasks/detail/tags/",
  removeTag:  "/api/v1/annotation_tasks/detail/tags/",
  bulkAddBadge: "/api/v1/annotation_tasks/bulk/badges/",
  bulkRemoveBadge: "/api/v1/annotation_tasks/bulk/badges/remove/",
  bulkResolveIds: "/api/v1/annotation_tasks/bulk/ids/",
  bulkAddTag: "/api/v1/annotation_tasks/bulk/tags/",
  bulkReplaceSoundEventTags: "/api/v1/annotation_tasks/bulk/sound_event_tags/replace/",
  bulkSoundEventTagSummary: "/api/v1/annotation_tasks/bulk/sound_event_tags/summary/",
  bulkDeleteSoundEventsByTag: "/api/v1/annotation_tasks/bulk/sound_events/delete/",
  getHistory: "/api/v1/annotation_tasks/detail/history/",
  getMainFrequencies: "/api/v1/annotation_tasks/detail/main_frequencies/",
};

const SoundEventMainFrequencySchema = z.object({
  sound_event_annotation_id: z.number(),
  main_frequency: z.number().nullable(),
});

export type SoundEventMainFrequency = z.infer<typeof SoundEventMainFrequencySchema>;

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
        ...buildAnnotationTaskFilterQueryParams(params),
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

  async function getIndex(
    query: GetAnnotationTasksQuery,
    signal?: AbortSignal,
  ): Promise<AnnotationTaskIndexPage> {
    const params = GetAnnotationTasksQuerySchema.parse(query);

    const response = await instance.get(endpoints.getIndex, {
      signal,
      params: {
        limit: params.limit,
        offset: params.offset,
        sort_by: params.sort_by,
        ...buildAnnotationTaskFilterQueryParams(params),
      },
    });
    return AnnotationTaskIndexPageSchema.parse(response.data);
  }

  async function getStats(
    filter: AnnotationTaskFilter,
    signal?: AbortSignal,
  ): Promise<AnnotationTaskStats> {
    const params = AnnotationTaskFilterSchema.parse(filter);

    const response = await instance.get(endpoints.getStats, {
      signal,
      params: buildAnnotationTaskFilterQueryParams(params),
    });
    return response.data as AnnotationTaskStats;
  }

  /**
   * The nights (noon to noon local time) of the tasks matching `filter`, with
   * their task counts. Meant for cheap filters (project, station, date range);
   * status counts under the full filter come from `getNightStats`.
   */
  async function getNights(
    filter: AnnotationTaskFilter,
    { utcOffset, limit, offset }: { utcOffset: number; limit?: number; offset?: number },
    signal?: AbortSignal,
  ): Promise<Paginated<AnnotationTaskNightTotal>> {
    const params = AnnotationTaskFilterSchema.parse(filter);
    const response = await instance.get(endpoints.getNights, {
      signal,
      params: {
        ...buildAnnotationTaskFilterQueryParams(params),
        utc_offset: utcOffset,
        limit,
        offset,
      },
    });
    return response.data as Paginated<AnnotationTaskNightTotal>;
  }

  /**
   * Status counts of the tasks matching `filter` in each of `nights` (evening
   * dates, or "none" for recordings without a date), in that order. Only those
   * nights' tasks are filtered, so it stays cheap on large projects.
   */
  async function getNightStats(
    filter: AnnotationTaskFilter,
    { nights, utcOffset }: { nights: string[]; utcOffset: number },
    signal?: AbortSignal,
  ): Promise<AnnotationTaskNight[]> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(
      buildAnnotationTaskFilterQueryParams(AnnotationTaskFilterSchema.parse(filter)),
    )) {
      if (value != null) params.append(key, String(value));
    }
    params.append("utc_offset", String(utcOffset));
    // Repeated, which axios would send as night[]=
    for (const night of nights) params.append("night", night);
    const response = await instance.get(endpoints.getNightStats, { signal, params });
    return response.data as AnnotationTaskNight[];
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
    const response = await instance.post(
      endpoints.addTag,
      { key: tag.key, value: tag.value },
      {
        params: {
          annotation_task_id: annotationTask.id,
        },
      }
    );
    return AnnotationTaskSchema.parse(response.data);
  }

  async function removeTag(
    annotationTask: AnnotationTask,
    tag: Tag,
  ): Promise<AnnotationTask> {
    const response = await instance.delete(endpoints.removeTag, {
      params: {
        annotation_task_id: annotationTask.id,
        key: tag.key,
        value: tag.value,
      },
    });
    return AnnotationTaskSchema.parse(response.data);
  }

  async function bulkAddBadge({
    filter,
    annotation_task_ids,
    state,
  }: {
    filter: AnnotationTaskFilter;
    annotation_task_ids?: number[];
    state: AnnotationStatus;
  }): Promise<AnnotationTaskBulkResult> {
    const response = await instance.post(
      endpoints.bulkAddBadge,
      {
        annotation_task_ids,
        state,
      },
      {
        params: buildAnnotationTaskFilterQueryParams(filter),
      },
    );
    return AnnotationTaskBulkResultSchema.parse(response.data);
  }

  async function bulkRemoveBadge({
    filter,
    annotation_task_ids,
    state,
  }: {
    filter: AnnotationTaskFilter;
    annotation_task_ids?: number[];
    state: AnnotationStatus;
  }): Promise<AnnotationTaskBulkResult> {
    const response = await instance.post(
      endpoints.bulkRemoveBadge,
      {
        annotation_task_ids,
        state,
      },
      {
        params: buildAnnotationTaskFilterQueryParams(filter),
      },
    );
    return AnnotationTaskBulkResultSchema.parse(response.data);
  }

  /** IDs a bulk action targets: the explicit ones matching the filter, or every match. */
  async function bulkResolveIds({
    filter,
    annotation_task_ids,
  }: {
    filter: AnnotationTaskFilter;
    annotation_task_ids?: number[];
  }): Promise<number[]> {
    const response = await instance.post(
      endpoints.bulkResolveIds,
      { annotation_task_ids },
      {
        params: buildAnnotationTaskFilterQueryParams(filter),
      },
    );
    return z.array(z.number().int()).parse(response.data);
  }

  async function bulkAddTag({
    filter,
    annotation_task_ids,
    tag,
  }: {
    filter: AnnotationTaskFilter;
    annotation_task_ids?: number[];
    tag: Pick<Tag, "key" | "value">;
  }): Promise<AnnotationTaskBulkResult> {
    const response = await instance.post(
      endpoints.bulkAddTag,
      {
        annotation_task_ids,
        tag: { key: tag.key, value: tag.value },
      },
      {
        params: buildAnnotationTaskFilterQueryParams(filter),
      },
    );
    return AnnotationTaskBulkResultSchema.parse(response.data);
  }

  async function bulkSoundEventTagSummary({
    filter,
    annotation_task_ids,
  }: {
    filter: AnnotationTaskFilter;
    annotation_task_ids?: number[];
  }): Promise<SoundEventTagBulkCount[]> {
    const response = await instance.post(
      endpoints.bulkSoundEventTagSummary,
      { annotation_task_ids },
      {
        params: buildAnnotationTaskFilterQueryParams(filter),
      },
    );
    return z.array(SoundEventTagBulkCountSchema).parse(response.data);
  }

  async function bulkReplaceSoundEventTags({
    filter,
    annotation_task_ids,
    old_tag,
    new_tag,
    replace_all,
    add_to_tagged,
    replace_group,
  }: {
    filter: AnnotationTaskFilter;
    annotation_task_ids?: number[];
    old_tag?: Pick<Tag, "key" | "value"> | null;
    new_tag?: Pick<Tag, "key" | "value"> | null;
    replace_all?: boolean;
    add_to_tagged?: boolean;
    replace_group?: string;
  }): Promise<AnnotationTaskBulkResult> {
    const response = await instance.post(
      endpoints.bulkReplaceSoundEventTags,
      {
        annotation_task_ids,
        old_tag: old_tag ?? undefined,
        new_tag: new_tag ?? undefined,
        replace_all: replace_all ?? false,
        add_to_tagged: add_to_tagged ?? false,
        replace_group,
      },
      {
        params: buildAnnotationTaskFilterQueryParams(filter),
      },
    );
    return AnnotationTaskBulkResultSchema.parse(response.data);
  }

  async function bulkDeleteSoundEventsByTag({
    filter,
    annotation_task_ids,
    tag,
  }: {
    filter: AnnotationTaskFilter;
    annotation_task_ids?: number[];
    tag: Pick<Tag, "key" | "value">;
  }): Promise<AnnotationTaskBulkResult> {
    const response = await instance.post(
      endpoints.bulkDeleteSoundEventsByTag,
      {
        annotation_task_ids,
        tag: { key: tag.key, value: tag.value },
      },
      {
        params: buildAnnotationTaskFilterQueryParams(filter),
      },
    );
    return AnnotationTaskBulkResultSchema.parse(response.data);
  }

  /** Original state of the task's imported sound events and every user edit since. */
  async function getHistory(annotationTaskId: number): Promise<SoundEventTaskHistory> {
    const response = await instance.get(endpoints.getHistory, {
      params: { annotation_task_id: annotationTaskId },
    });
    return SoundEventTaskHistorySchema.parse(response.data);
  }

  /** Main (peak) frequency of each sound event of the task, in Hz (null where none can be measured). */
  async function getMainFrequencies(
    annotationTaskId: number,
    signal?: AbortSignal,
  ): Promise<SoundEventMainFrequency[]> {
    const response = await instance.get(endpoints.getMainFrequencies, {
      params: { annotation_task_id: annotationTaskId },
      signal,
    });
    return z.array(SoundEventMainFrequencySchema).parse(response.data);
  }

  return {
    getMany,
    getIndex,
    getStats,
    getNights,
    getNightStats,
    get: getAnnotationTask,
    delete: deleteAnnotationTask,
    addBadge,
    removeBadge,
    addNote,
    removeNote,
    addTag,
    removeTag,
    bulkAddBadge,
    bulkRemoveBadge,
    bulkResolveIds,
    bulkAddTag,
    bulkReplaceSoundEventTags,
    bulkSoundEventTagSummary,
    bulkDeleteSoundEventsByTag,
    getHistory,
    getMainFrequencies,
  } as const;
}
