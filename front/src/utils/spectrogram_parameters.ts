/* Functions for handling spectrogram parameters */
import {
  MAX_FFT_SIZE,
  MAX_HOP_FRACTION,
  MIN_FFT_SIZE,
  MIN_HOP_FRACTION,
} from "@/constants";

import type { SpectrogramParameters } from "@/types";

export type ParameterConstraints = {
  /* Acceptable window sizes for the spectrogram */
  windowSize: {
    min: number;
    max: number;
  };
  /* Acceptable hop sizes for the spectrogram */
  hopSize: {
    min: number;
    max: number;
  };
  /* Frequency range of the displayed audio */
  frequencyRange: {
    min: number;
    max: number;
  };
  /* Samplerate of the displayed audio */
  samplerate: number;

  /* Acceptable gamma settings for the spectrogram */
  gamma: {
    min: number;
    max: number;
  };

  /* Available channels for the recording */
  channels: {
    min: number;
    max: number;
  };
};

/** Compute the constraints for the spectrogram parameters
 * based on the samplerate and channel count of the audio
 */
export function computeConstraints(samplerate: number, maxChannels: number = 1): ParameterConstraints {
  const minWindowSize = MIN_FFT_SIZE / (samplerate/2);
  const maxWindowSize = MAX_FFT_SIZE / (samplerate/2);
  return {
    windowSize: {
      min: minWindowSize,
      max: maxWindowSize,
    },
    hopSize: {
      min: MIN_HOP_FRACTION,
      max: MAX_HOP_FRACTION,
    },
    frequencyRange: {
      min: 0,
      max: samplerate / 2, // Nyquist frequency
    },
    samplerate: samplerate,
    gamma: {
      min: 1.0,
      max: 5.0,
    },
    channels: {
      min: 0,
      max: Math.max(0, maxChannels - 1), // 0-indexed
    },
  };
}

function clamp(
  val: number,
  { min, max }: { min: number; max: number },
): number {
  return Math.max(Math.min(val, max), min);
}

export function validateParameters(
  parameters: SpectrogramParameters,
  constraints: ParameterConstraints,
): SpectrogramParameters {
  const samplerate = parameters.samplerate || constraints.samplerate;

  const lowFreq =
    parameters.low_freq == null
      ? undefined
      : clamp(parameters.low_freq, constraints.frequencyRange);

  const highFreq =
    parameters.high_freq == null
      ? undefined
      : clamp(parameters.high_freq, constraints.frequencyRange);

  const windowSize = clamp(parameters.window_size, constraints.windowSize);
  const hopSize = clamp(parameters.hop_size, constraints.hopSize);
  const gamma = clamp(parameters.gamma, constraints.gamma);
  const channel = clamp(parameters.channel, constraints.channels);

  return {
    ...parameters,
    samplerate,
    low_freq: lowFreq,
    high_freq: highFreq,
    window_size: windowSize,
    hop_size: hopSize,
    gamma: gamma,
    channel: channel,
  };
}
