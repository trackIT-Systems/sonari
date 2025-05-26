import { AxiosInstance } from "axios";
import { z } from "zod";

import { GetManySchema, Page } from "@/api/common";
import { AnnotationProjectSchema } from "@/schemas";

import type { AnnotationProject, Tag, AnnotationStatus } from "@/types";

const DEFAULT_ENDPOINTS = {
  getMany: "/api/v1/annotation_projects/",
  get: "/api/v1/annotation_projects/detail/",
  create: "/api/v1/annotation_projects/",
  update: "/api/v1/annotation_projects/detail/",
  delete: "/api/v1/annotation_projects/detail/",
  addTag: "/api/v1/annotation_projects/detail/tags/",
  removeTag: "/api/v1/annotation_projects/detail/tags/",
  export: "/api/v1/annotation_projects/detail/export/",
  import: "/api/v1/annotation_projects/import/",
};

export const AnnotationProjectFilterSchema = z.object({
  search: z.string().optional(),
});

export type AnnotationProjectFilter = z.input<
  typeof AnnotationProjectFilterSchema
>;

export const AnnotationProjectCreateSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  annotation_instructions: z.string().nullable().optional(),
});

export type AnnotationProjectCreate = z.input<
  typeof AnnotationProjectCreateSchema
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

  async function get(uuid: string): Promise<AnnotationProject> {
    const { data } = await instance.get(endpoints.get, {
      params: { annotation_project_uuid: uuid },
    });
    return AnnotationProjectSchema.parse(data);
  }

  async function create(
    data: AnnotationProjectCreate,
  ): Promise<AnnotationProject> {
    const body = AnnotationProjectCreateSchema.parse(data);
    const { data: responseData } = await instance.post(endpoints.create, body);
    return AnnotationProjectSchema.parse(responseData);
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
        params: { annotation_project_uuid: annotationProject.uuid },
      },
    );
    return AnnotationProjectSchema.parse(responseData);
  }

  async function deleteAnnotationProject(
    annotationProject: AnnotationProject,
  ): Promise<AnnotationProject> {
    const { data } = await instance.delete(endpoints.delete, {
      params: { annotation_project_uuid: annotationProject.uuid },
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
          annotation_project_uuid: annotationProject.uuid,
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
        annotation_project_uuid: annotationProject.uuid,
        key: tag.key,
        value: tag.value,
      },
    });
    return AnnotationProjectSchema.parse(data);
  }
  async function exportProject(
    annotationProjects: AnnotationProject[],
    queryString: string
  ): Promise<{ blob: Blob; filename: string }> {
    const uuids = annotationProjects
    .map(p => `annotation_project_uuids=${encodeURIComponent(p.uuid)}`)
    .join('&');
    const response = await instance.get(`${endpoints.export}?${uuids}&${queryString}`, {
      responseType: 'blob',
      withCredentials: true,
    });
    // Extract filename from Content-Disposition header
    const contentDisposition = response.headers['content-disposition'];
    let filename = 'export.xlsx'; // Default filename
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="?(.+)"?/i);
      if (filenameMatch) {
        filename = filenameMatch[1];
      }
    }
  
    // Create a Blob with the correct MIME type for XLSX
    const blob = new Blob([response.data], { 
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    });
  
    return { blob, filename };
  }

  async function importProject(data: FormData): Promise<AnnotationProject> {
    const { data: res } = await instance.post(endpoints.import, data);
    return AnnotationProjectSchema.parse(res);
  }

  return {
    getMany,
    get,
    create,
    update,
    delete: deleteAnnotationProject,
    addTag,
    removeTag,
    import: importProject,
    download: exportProject,
  } as const;
}
