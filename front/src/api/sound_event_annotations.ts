import { AxiosInstance } from "axios";
import { z } from "zod";

import { GetManySchema, Page } from "@/api/common";
import {
  AnnotationProjectSchema,
  GeometrySchema,
  RecordingSchema,
  SoundEventAnnotationSchema,
  TagSchema,
  UserSchema,
} from "@/schemas";

import type { AnnotationTask, SoundEventAnnotation, Tag } from "@/types";

const SoundEventAnnotationCreateSchema = z.object({
  geometry: GeometrySchema,
  tags: z.array(TagSchema).optional(),
});

export type SoundEventAnnotationCreate = z.input<
  typeof SoundEventAnnotationCreateSchema
>;

const SoundEventAnnotationUpdateSchema = z.object({
  geometry: GeometrySchema,
});

export type SoundEventAnnotationUpdate = z.input<
  typeof SoundEventAnnotationUpdateSchema
>;

const DEFAULT_ENDPOINTS = {
  create: "/api/v1/sound_event_annotations/",
  getMany: "/api/v1/sound_event_annotations/",
  get: "/api/v1/sound_event_annotations/detail/",
  update: "/api/v1/sound_event_annotations/detail/",
  delete: "/api/v1/sound_event_annotations/detail/",
  addTag: "/api/v1/sound_event_annotations/detail/tags/",
  removeTag: "/api/v1/sound_event_annotations/detail/tags/",
};

export function registerSoundEventAnnotationsAPI(
  instance: AxiosInstance,
  endpoints: typeof DEFAULT_ENDPOINTS = DEFAULT_ENDPOINTS,
) {
  async function create(
    annotationTask: AnnotationTask,
    data: SoundEventAnnotationCreate,
  ): Promise<SoundEventAnnotation> {
    const body = SoundEventAnnotationCreateSchema.parse(data);
    const response = await instance.post(endpoints.create, body, {
      params: { annotation_task_id: annotationTask.id },
    });
    return SoundEventAnnotationSchema.parse(response.data);
  }

  async function getSoundEventAnnotation(
    id: number,
  ): Promise<SoundEventAnnotation> {
    const response = await instance.get(endpoints.get, {
      params: { sound_event_annotation_id: id },
    });
    return SoundEventAnnotationSchema.parse(response.data);
  }

  async function updateSoundEventAnnotation(
    soundEventAnnotation: SoundEventAnnotation,
    data: SoundEventAnnotationUpdate,
  ): Promise<SoundEventAnnotation> {
    const body = SoundEventAnnotationUpdateSchema.parse(data);
    const response = await instance.patch(endpoints.update, body, {
      params: {
        sound_event_annotation_id: soundEventAnnotation.id,
      },
    });
    return SoundEventAnnotationSchema.parse(response.data);
  }

  async function deleteSoundEventAnnotation(
    soundEventAnnotation: SoundEventAnnotation,
  ): Promise<SoundEventAnnotation> {
    const response = await instance.delete(endpoints.delete, {
      params: {
        sound_event_annotation_id: soundEventAnnotation.id,
      },
    });
    return SoundEventAnnotationSchema.parse(response.data);
  }

  async function addTag(
    soundEventAnnotation: SoundEventAnnotation,
    tag: Tag,
  ): Promise<SoundEventAnnotation> {
    const response = await instance.post(
      endpoints.addTag,
      {},
      {
        params: {
          sound_event_annotation_id: soundEventAnnotation.id,
          key: tag.key,
          value: tag.value,
        },
      },
    );
    return SoundEventAnnotationSchema.parse(response.data);
  }

  async function removeTag(
    soundEventAnnotation: SoundEventAnnotation,
    tag: Tag,
  ): Promise<SoundEventAnnotation> {
    const response = await instance.delete(endpoints.removeTag, {
      params: {
        sound_event_annotation_id: soundEventAnnotation.id,
        key: tag.key,
        value: tag.value,
      },
    });
    return SoundEventAnnotationSchema.parse(response.data);
  }


  return {
    create,
    get: getSoundEventAnnotation,
    update: updateSoundEventAnnotation,
    addTag,
    removeTag,
    delete: deleteSoundEventAnnotation,
  } as const;
}
