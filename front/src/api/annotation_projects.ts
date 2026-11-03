import { AxiosInstance } from "axios";
import { z } from "zod";

import { GetManySchema, Page } from "@/api/common";
import { AnnotationProjectSchema, ProjectTagScopeSchema } from "@/schemas";

import type { AnnotationProject, ProjectTagScope, TagScope } from "@/types";

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

const PredictionCorrectionTargetSchema = z.object({
  key: z.string(),
  value: z.string(),
  count: z.number(),
});

const PredictionConfidenceSchema = z.object({
  count: z.number(),
  mean: z.number(),
  median: z.number(),
});

const PredictionConfidenceComparisonSchema = z.object({
  confirmed: PredictionConfidenceSchema.nullable(),
  corrected: PredictionConfidenceSchema.nullable(),
  suggested_threshold: z.number().nullable(),
});

const PredictionCorrectionCountSchema = z.object({
  key: z.string(),
  value: z.string(),
  predicted: z.number(),
  confirmed: z.number(),
  relabeled: z.number(),
  tag_removed: z.number(),
  event_deleted: z.number(),
  box_changed: z.number(),
  relabeled_to: z.array(PredictionCorrectionTargetSchema),
  confidence: PredictionConfidenceComparisonSchema,
});

const PredictionCorrectionStatsSchema = z.object({
  detector: z.string().nullable(),
  run_id: z.number().nullable(),
  model_versions: z.array(z.string()),
  reviewed_tasks: z.number(),
  recordings: z.number(),
  recordings_with_source: z.number(),
  match_rate: z.number().nullable(),
  reliable: z.boolean(),
  confidence: PredictionConfidenceComparisonSchema,
  species: z.array(PredictionCorrectionCountSchema),
  added: z.array(PredictionCorrectionTargetSchema),
});

export type PredictionConfidenceComparison = z.infer<typeof PredictionConfidenceComparisonSchema>;
export type PredictionCorrectionCount = z.infer<typeof PredictionCorrectionCountSchema>;
export type PredictionCorrectionStats = z.infer<typeof PredictionCorrectionStatsSchema>;

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

export type AnnotationProjectUpdate = {
  tag_scope?: TagScope;
  tag_group_id?: number | null;
  tag_preset_id?: number | null;
};

const DEFAULT_ENDPOINTS = {
  getMany: "/api/v1/annotation_projects/",
  get: "/api/v1/annotation_projects/detail/",
  getProgress: "/api/v1/annotation_projects/detail/progress/",
  getSpeciesCounts: "/api/v1/annotation_projects/detail/species_counts/",
  getPredictionCorrections: "/api/v1/annotation_projects/detail/prediction_corrections/",
  getTagScope: "/api/v1/annotation_projects/detail/tag_scope/",
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

  async function getPredictionCorrections(id: number): Promise<PredictionCorrectionStats> {
    const { data } = await instance.get(endpoints.getPredictionCorrections, {
      params: { annotation_project_id: id },
    });
    return PredictionCorrectionStatsSchema.parse(data);
  }

  async function update(
    id: number,
    data: AnnotationProjectUpdate,
  ): Promise<AnnotationProject> {
    const { data: updated } = await instance.patch(endpoints.get, data, {
      params: { annotation_project_id: id },
    });
    return AnnotationProjectSchema.parse(updated);
  }

  async function getTagScope(id: number): Promise<ProjectTagScope> {
    const { data } = await instance.get(endpoints.getTagScope, {
      params: { annotation_project_id: id },
    });
    return ProjectTagScopeSchema.parse(data);
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
    getPredictionCorrections,
    update,
    getTagScope,
    getGuidedTourAvailable,
    ensureGuidedTour,
  } as const;
}
