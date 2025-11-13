import {
  DEFAULT_CMAP,
  DEFAULT_FILTER_ORDER,
  DEFAULT_OVERLAP_PERCENT,
  DEFAULT_CONF_PRESET,
  DEFAULT_SCALE,
  DEFAULT_WINDOW,
  DEFAULT_WINDOW_SIZE_SAMPLES,
  MIN_DB,
} from "@/constants";
import { IntervalSchema, SpectrogramParametersSchema } from "@/schemas";

import type { Interval, Recording, SpectrogramParameters } from "@/types";
import { AxiosInstance } from "axios";

const DEFAULT_ENDPOINTS = {
  get: "/api/v1/spectrograms/",
};

export const DEFAULT_SPECTROGRAM_PARAMETERS: SpectrogramParameters = {
  conf_preset: DEFAULT_CONF_PRESET,
  resample: false,
  scale: DEFAULT_SCALE,
  pcen: false,
  window_size_samples: DEFAULT_WINDOW_SIZE_SAMPLES,
  overlap_percent: DEFAULT_OVERLAP_PERCENT,
  cmap: DEFAULT_CMAP,
  window: DEFAULT_WINDOW,
  filter_order: DEFAULT_FILTER_ORDER,
  normalize: false,
  clamp: true,
  min_dB: -90,
  max_dB: 0,
  channel: 0,
  gamma: 1.2,
  freqLines: []
};

export function registerSpectrogramAPI(
  instsance: AxiosInstance,
  endpoints: typeof DEFAULT_ENDPOINTS = DEFAULT_ENDPOINTS,
) {
  function getUrl({
    recording_id,
    segment,
    parameters = DEFAULT_SPECTROGRAM_PARAMETERS,
    lowRes = false,
  }: {
    recording_id: number;
    segment: Interval;
    parameters?: SpectrogramParameters;
    lowRes?: boolean;
  }) {
    // Validate parameters
    const parsed_params = SpectrogramParametersSchema.parse(parameters);
    const parsed_segment = IntervalSchema.parse(segment);

    // Construct query
    const query = {
      recording_id,
      start_time: parsed_segment.min,
      end_time: parsed_segment.max,
      low_res: lowRes,
      ...parsed_params,
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
