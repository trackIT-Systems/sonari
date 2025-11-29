import {
  DEFAULT_CMAP,
  DEFAULT_FILTER_ORDER,
  DEFAULT_OVERLAP_PERCENT,
  DEFAULT_SCALE,
  DEFAULT_WINDOW,
  DEFAULT_WINDOW_SIZE_SAMPLES,
  WINDOW_SIZE_OPTIONS,
  OVERLAP_OPTIONS,
  AUTO_STFT_TARGET_DURATION,
  AUTO_STFT_BASE_OVERLAP,
  AUTO_STFT_BASE_WINDOW_SIZE,
  AUTO_STFT_MIN_WINDOW_SIZE,
} from "@/constants";
import { IntervalSchema, SpectrogramParametersSchema } from "@/schemas";

import type { Interval, SpectrogramParameters } from "@/types";
import { AxiosInstance } from "axios";

/**
 * Find the nearest available option from a list of options.
 */
function findNearestOption(target: number, options: number[]): number {
  return options.reduce((prev, curr) =>
    Math.abs(curr - target) < Math.abs(prev - target) ? curr : prev
  );
}

/**
 * Calculate the target hop size based on the base parameters.
 * Base: 1024 samples at 96% overlap = 40.96 samples hop size
 */
const AUTO_STFT_BASE_HOP_SIZE = AUTO_STFT_BASE_WINDOW_SIZE * (1 - AUTO_STFT_BASE_OVERLAP / 100);

/**
 * Calculate optimal STFT parameters based on sample rate.
 * Maintains consistent audio duration (~0.002048s) across different sample rates.
 * Also scales overlap to maintain consistent hop size, preventing visual stretching.
 */
function calculateAutoSTFTParams(samplerate: number): {
  windowSize: number;
  overlap: number;
} {
  const targetWindowSize = samplerate * AUTO_STFT_TARGET_DURATION;
  const windowSize = Math.max(
    AUTO_STFT_MIN_WINDOW_SIZE,
    findNearestOption(targetWindowSize, WINDOW_SIZE_OPTIONS)
  );
  
  // Calculate overlap to maintain consistent hop size
  // This prevents visual stretching when window size changes
  const targetOverlapPercent = (1 - AUTO_STFT_BASE_HOP_SIZE / windowSize) * 100;
  
  // Clamp to valid range and find nearest available option
  const clampedOverlap = Math.max(50, Math.min(98, targetOverlapPercent));
  const overlap = findNearestOption(clampedOverlap, OVERLAP_OPTIONS);
  
  return { windowSize, overlap };
}

/**
 * Apply auto STFT calculation to parameters if auto_stft is enabled.
 * This ensures consistent window size and overlap based on the effective samplerate.
 */
export function applyAutoSTFT(
  parameters: SpectrogramParameters,
  recordingSamplerate: number
): SpectrogramParameters {
  if (!parameters.auto_stft) {
    return parameters;
  }

  // Determine effective samplerate
  const effectiveSamplerate = parameters.resample && parameters.samplerate
    ? parameters.samplerate
    : recordingSamplerate;

  const { windowSize, overlap } = calculateAutoSTFTParams(effectiveSamplerate);

  return {
    ...parameters,
    window_size_samples: windowSize,
    overlap_percent: overlap,
  };
}

const DEFAULT_ENDPOINTS = {
  get: "/api/v1/spectrograms/",
};

export const DEFAULT_SPECTROGRAM_PARAMETERS: SpectrogramParameters = {
  resample: false,
  auto_stft: true,
  scale: DEFAULT_SCALE,
  pcen: true,
  window_size_samples: DEFAULT_WINDOW_SIZE_SAMPLES,
  overlap_percent: DEFAULT_OVERLAP_PERCENT,
  cmap: DEFAULT_CMAP,
  window: DEFAULT_WINDOW,
  filter_order: DEFAULT_FILTER_ORDER,
  normalize: false,
  clamp: true,
  min_dB: -140,
  max_dB: 0,
  channel: 0,
  gamma: 1.0,
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
  }: {
    recording_id: number;
    segment: Interval;
    parameters?: SpectrogramParameters;
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
