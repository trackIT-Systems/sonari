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
  import { AudioParameters, DEFAULT_AUDIO_PARAMETERS, AudioParametersSchema } from "./audio";
  import { AxiosInstance } from "axios";
import { DEFAULT_SPECTROGRAM_PARAMETERS } from "./spectrograms";
  
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
    get: "/api/v1/waveforms/",
  };
  
  export function registerWaveformsAPI(
    instsance: AxiosInstance,
    endpoints: typeof DEFAULT_ENDPOINTS = DEFAULT_ENDPOINTS,
  ) {
    function getUrl({
      recording,
      parameters=DEFAULT_SPECTROGRAM_PARAMETERS,
    }: {
      recording: Recording;
      parameters?: SpectrogramParameters;
    }) {
      const parsed_params = SpectrogramParametersSchema.parse(parameters);
      const { gamma, cmap } = parsed_params;
      // Construct query
      const query = {
        recording_uuid: recording.uuid,
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
  