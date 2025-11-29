import { IntervalSchema, SpectrogramParametersSchema } from "@/schemas";
import { DEFAULT_SPECTROGRAM_PARAMETERS } from "./spectrograms";

import type { Interval, SpectrogramParameters } from "@/types";
import { AxiosInstance } from "axios";

const DEFAULT_ENDPOINTS = {
  get: "/api/v1/psd/",
};

export type PSDParameters = {
  width?: number;
  height?: number;
  freq_min?: number;
  freq_max?: number;
};

export const DEFAULT_PSD_PARAMETERS: PSDParameters = {
  width: 448,
  height: 224,
};

export function registerPsdAPI(
  instance: AxiosInstance,
  endpoints: typeof DEFAULT_ENDPOINTS = DEFAULT_ENDPOINTS,
) {
  function getUrl({
    recording_id,
    segment,
    parameters = DEFAULT_SPECTROGRAM_PARAMETERS,
    psdParameters = DEFAULT_PSD_PARAMETERS,
  }: {
    recording_id: number;
    segment: Interval;
    parameters?: SpectrogramParameters;
    psdParameters?: PSDParameters;
  }) {
    // Validate parameters
    const parsed_params = SpectrogramParametersSchema.parse(parameters);
    const parsed_segment = IntervalSchema.parse(segment);

    // Construct query
    const query = {
      recording_id,
      start_time: parsed_segment.min,
      end_time: parsed_segment.max,
      ...parsed_params,
      ...psdParameters,
    };

    const params = new URLSearchParams(
      Object.fromEntries(
        Object.entries(query)
          .filter(([_, value]) => value != null)
          .map(([key, value]) => [key, value.toString()]),
      ),
    );

    // Get url
    return `${instance.defaults.baseURL}${endpoints.get}?${params}`;
  }

  return {
    getUrl,
  };
}

