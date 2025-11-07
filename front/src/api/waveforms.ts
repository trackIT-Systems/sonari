import { IntervalSchema, SpectrogramParametersSchema } from "@/schemas";

import type { Recording, SpectrogramParameters } from "@/types";
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
    parameters = DEFAULT_SPECTROGRAM_PARAMETERS,
  }: {
    recording: Recording;
    parameters?: SpectrogramParameters;
  }) {
    const parsed_params = SpectrogramParametersSchema.parse(parameters);
    const { gamma, cmap } = parsed_params;
    // Construct query
    const query = {
      recording_id: recording.id,
      gamma,
      cmap
    };

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
