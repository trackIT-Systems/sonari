import {
  DEFAULT_CMAP,
  DEFAULT_FILTER_ORDER,
  DEFAULT_HOP_SIZE,
  DEFAULT_CONF_PRESET,
  DEFAULT_SCALE,
  DEFAULT_WINDOW,
  DEFAULT_WINDOW_SIZE,
  MIN_DB,
} from "@/constants";
import { IntervalSchema, SpectrogramParametersSchema } from "@/schemas";

import type { Interval, Recording, SpectrogramParameters } from "@/types";
import { AxiosInstance } from "axios";

// NOTE: This duplication is temporary, while we update code to use the types
// and schemas files
export {
  DEFAULT_CMAP,
  DEFAULT_FILTER_ORDER,
  DEFAULT_HOP_SIZE,
  DEFAULT_SCALE,
  DEFAULT_WINDOW,
  DEFAULT_WINDOW_SIZE,
  MIN_DB,
};

const DEFAULT_ENDPOINTS = {
  get: "/api/v1/spectrograms/",
  getLow: "/api/v1/spectrograms/low"
};

export const DEFAULT_SPECTROGRAM_PARAMETERS: SpectrogramParameters = {
  conf_preset: DEFAULT_CONF_PRESET,
  resample: false,
  scale: DEFAULT_SCALE,
  pcen: false,
  window_size: DEFAULT_WINDOW_SIZE,
  hop_size: DEFAULT_HOP_SIZE,
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
    recording,
    segment,
    parameters = DEFAULT_SPECTROGRAM_PARAMETERS,
    lowRes = false,
  }: {
    recording: Recording;
    segment: Interval;
    parameters?: SpectrogramParameters;
    lowRes?: boolean;
  }) {
    // Validate parameters
    const parsed_params = SpectrogramParametersSchema.parse(parameters);
    const parsed_segment = IntervalSchema.parse(segment);

    // Construct query
    const query = {
      recording_uuid: recording.uuid,
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
