import { IntervalSchema, SpectrogramParametersSchema } from "@/schemas";

import type { Interval, Recording, SpectrogramParameters } from "@/types";
import { AxiosInstance } from "axios";
import { DEFAULT_SPECTROGRAM_PARAMETERS } from "./spectrograms";


const DEFAULT_ENDPOINTS = {
  get: "/api/v1/waveforms/",
};

export function registerWaveformsAPI(
  instsance: AxiosInstance,
  endpoints: typeof DEFAULT_ENDPOINTS = DEFAULT_ENDPOINTS,
) {
  function getUrl({
    recording,
    segment,
    parameters = DEFAULT_SPECTROGRAM_PARAMETERS,
  }: {
    recording: Recording;
    segment?: Interval;
    parameters?: SpectrogramParameters;
  }) {
    const parsed_params = SpectrogramParametersSchema.parse(parameters);
    const { gamma, cmap, window_size_samples, overlap_percent } = parsed_params;
    
    // Construct query
    const query: Record<string, string | number | boolean> = {
      recording_id: recording.id,
      gamma,
      cmap,
      window_size_samples,
      overlap_percent,
    };

    // Add segment parameters if provided
    if (segment) {
      const parsed_segment = IntervalSchema.parse(segment);
      query.start_time = parsed_segment.min;
      query.end_time = parsed_segment.max;
    }

    const params = new URLSearchParams(
      Object.fromEntries(
        Object.entries(query)
          .filter(([_, value]) => value != null)
          .map(([key, value]) => [key, value.toString()]),
      ),
    );

    // Get url
    return `${instsance.defaults.baseURL}${endpoints.get}?${params}`;
  }

  return {
    getUrl,
  };
}
