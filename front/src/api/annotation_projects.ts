import { AxiosInstance } from "axios";
import { z } from "zod";

import { GetManySchema, Page } from "@/api/common";
import { AnnotationProjectSchema } from "@/schemas";

import type { AnnotationProject, Tag } from "@/types";

const DEFAULT_ENDPOINTS = {
  getMany: "/api/v1/annotation_projects/",
  create: "/api/v1/annotation_projects/",
  get: "/api/v1/annotation_projects/detail/",
  update: "/api/v1/annotation_projects/detail/",
  delete: "/api/v1/annotation_projects/detail/",
  addTag: "/api/v1/annotation_projects/detail/tags/",
  removeTag: "/api/v1/annotation_projects/detail/tags/",
};

export const AnnotationProjectFilterSchema = z.object({
  search: z.string().optional(),
});

export type AnnotationProjectFilter = z.input<
  typeof AnnotationProjectFilterSchema
>;

export const AnnotationProjectUpdateSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  annotation_instructions: z.string().optional(),
});

export type AnnotationProjectUpdate = z.input<
  typeof AnnotationProjectUpdateSchema
>;

export const AnnotationProjectPageSchema = Page(AnnotationProjectSchema);

export type AnnotationProjectPage = z.infer<typeof AnnotationProjectPageSchema>;

export const GetAnnotationProjectsQuerySchema = z.intersection(
  GetManySchema,
  AnnotationProjectFilterSchema,
);

export type GetAnnotationProjectsQuery = z.input<
  typeof GetAnnotationProjectsQuerySchema
>;

export function registerAnnotationProjectAPI(
  instance: AxiosInstance,
  endpoints: typeof DEFAULT_ENDPOINTS = DEFAULT_ENDPOINTS
) {
  async function getMany(
    query: GetAnnotationProjectsQuery,
  ): Promise<AnnotationProjectPage> {
    const params = GetAnnotationProjectsQuerySchema.parse(query);
    const { data } = await instance.get(endpoints.getMany, { params });
    return AnnotationProjectPageSchema.parse(data);
  }

  async function get(id: number): Promise<AnnotationProject> {
    const { data } = await instance.get(endpoints.get, {
      params: { annotation_project_id: id },
    });
    return AnnotationProjectSchema.parse(data);
  }

  async function update(
    annotationProject: AnnotationProject,
    data: AnnotationProjectUpdate,
  ): Promise<AnnotationProject> {
    const body = AnnotationProjectUpdateSchema.parse(data);
    const { data: responseData } = await instance.patch(
      endpoints.update,
      body,
      {
        params: { annotation_project_id: annotationProject.id },
      },
    );
    return AnnotationProjectSchema.parse(responseData);
  }

  async function deleteAnnotationProject(
    annotationProject: AnnotationProject,
  ): Promise<AnnotationProject> {
    const { data } = await instance.delete(endpoints.delete, {
      params: { annotation_project_id: annotationProject.id },
    });
    return AnnotationProjectSchema.parse(data);
  }

  async function addTag(
    annotationProject: AnnotationProject,
    tag: Tag,
  ): Promise<AnnotationProject> {
    const { data } = await instance.post(
      endpoints.addTag,
      {},
      {
        params: {
          annotation_project_id: annotationProject.id,
          key: tag.key,
          value: tag.value,
        },
      },
    );
    return AnnotationProjectSchema.parse(data);
  }

  async function removeTag(
    annotationProject: AnnotationProject,
    tag: Tag,
  ): Promise<AnnotationProject> {
    const { data } = await instance.delete(endpoints.removeTag, {
      params: {
        annotation_project_id: annotationProject.id,
        key: tag.key,
        value: tag.value,
      },
    });
    return AnnotationProjectSchema.parse(data);
  }

  return {
    getMany,
    get,
    update,
    delete: deleteAnnotationProject,
    addTag,
    removeTag,
  } as const;
}
