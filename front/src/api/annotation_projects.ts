import { AxiosInstance } from "axios";
import { z } from "zod";

import { GetManySchema, Page } from "@/api/common";
import { AnnotationProjectSchema } from "@/schemas";

import type { AnnotationProject } from "@/types";

const AnnotationProjectProgressSchema = z.object({
  total: z.number(),
  verified: z.number(),
  rejected: z.number(),
  completed: z.number(),
  assigned: z.number(),
  pending: z.number(),
});

type AnnotationProjectProgress = z.infer<typeof AnnotationProjectProgressSchema>;

const SpeciesTagCountSchema = z.object({
  key: z.string(),
  value: z.string(),
  count: z.number(),
  accepted: z.number(),
  verified: z.number(),
  unsure: z.number(),
  rejected: z.number(),
  no_status: z.number(),
});

type SpeciesTagCount = z.infer<typeof SpeciesTagCountSchema>;

const GuidedTourVariantSchema = z.enum(["bird", "bat"]);
export type GuidedTourVariant = z.infer<typeof GuidedTourVariantSchema>;

const GuidedTourEnsureResponseSchema = z.object({
  annotation_project_id: z.number().int().positive(),
  first_annotation_task_id: z.number().int().positive().nullable(),
  resume_annotation_task_id: z.number().int().positive().nullish(),
  created: z.boolean(),
  variant: GuidedTourVariantSchema,
});

export type GuidedTourEnsureResponse = z.infer<typeof GuidedTourEnsureResponseSchema>;

const GuidedTourProgressSchema = z.object({
  variant: GuidedTourVariantSchema,
  annotation_project_id: z.number().int().positive(),
  total_tasks: z.number().int(),
  done_tasks: z.number().int(),
  resume_annotation_task_id: z.number().int().positive().nullable(),
});

export type GuidedTourProgress = z.infer<typeof GuidedTourProgressSchema>;

const GuidedTourAvailableResponseSchema = z.object({
  variants: z.array(GuidedTourVariantSchema),
  tours: z.array(GuidedTourProgressSchema).default([]),
});

export type GuidedTourAvailableResponse = z.infer<
  typeof GuidedTourAvailableResponseSchema
>;

const DEFAULT_ENDPOINTS = {
  getMany: "/api/v1/annotation_projects/",
  get: "/api/v1/annotation_projects/detail/",
  getProgress: "/api/v1/annotation_projects/detail/progress/",
  getSpeciesCounts: "/api/v1/annotation_projects/detail/species_counts/",
  ensureGuidedTour: "/api/v1/annotation_projects/guided_tour/",
};

const AnnotationProjectFilterSchema = z.object({
  search: z.string().optional(),
});

export type AnnotationProjectFilter = z.input<
  typeof AnnotationProjectFilterSchema
>;

const AnnotationProjectPageSchema = Page(AnnotationProjectSchema);

type AnnotationProjectPage = z.infer<typeof AnnotationProjectPageSchema>;

const GetAnnotationProjectsQuerySchema = z.intersection(
  GetManySchema,
  AnnotationProjectFilterSchema,
);

type GetAnnotationProjectsQuery = z.input<
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

  async function getProgress(id: number): Promise<AnnotationProjectProgress> {
    const { data } = await instance.get(endpoints.getProgress, {
      params: { annotation_project_id: id },
    });
    return AnnotationProjectProgressSchema.parse(data);
  }

  async function getSpeciesCounts(id: number): Promise<SpeciesTagCount[]> {
    const { data } = await instance.get(endpoints.getSpeciesCounts, {
      params: { annotation_project_id: id },
    });
    return z.array(SpeciesTagCountSchema).parse(data);
  }

  async function getGuidedTourAvailable(): Promise<GuidedTourAvailableResponse> {
    const { data } = await instance.get(endpoints.ensureGuidedTour);
    return GuidedTourAvailableResponseSchema.parse(data);
  }

  async function ensureGuidedTour(
    options: { variant: GuidedTourVariant; reset?: boolean },
  ): Promise<GuidedTourEnsureResponse> {
    const { data } = await instance.post(endpoints.ensureGuidedTour, {
      variant: options.variant,
      reset: options.reset ?? false,
    });
    return GuidedTourEnsureResponseSchema.parse(data);
  }

  return {
    getMany,
    get,
    getProgress,
    getSpeciesCounts,
    getGuidedTourAvailable,
    ensureGuidedTour,
  } as const;
}
