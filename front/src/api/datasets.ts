import { AxiosInstance } from "axios";
import { z } from "zod";

import { DatasetSchema } from "@/schemas";

import { GetManySchema, Page } from "./common";

const DatasetFilterSchema = z.object({
  search: z.string().optional(),
});

export type DatasetFilter = z.input<typeof DatasetFilterSchema>;

const DatasetPageSchema = Page(DatasetSchema);

export type DatasetPage = z.infer<typeof DatasetPageSchema>;

const GetDatasetsQuerySchema = z.intersection(
  GetManySchema,
  DatasetFilterSchema,
);

export type GetDatasetsQuery = z.input<typeof GetDatasetsQuerySchema>;

const DEFAULT_ENDPOINTS = {
  getMany: "/api/v1/datasets/",
};

export function registerDatasetAPI(
  instance: AxiosInstance,
  endpoints: typeof DEFAULT_ENDPOINTS = DEFAULT_ENDPOINTS,
) {
  async function getMany(query: GetDatasetsQuery): Promise<DatasetPage> {
    const params = GetDatasetsQuerySchema.parse(query);
    const { data } = await instance.get(endpoints.getMany, { params });
    return DatasetPageSchema.parse(data);
  }

  return {
    getMany,
  } as const;
}
