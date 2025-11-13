/* Functions for handling spectrogram parameters */
import type { SpectrogramParameters } from "@/types";

export type ParameterConstraints = {
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
  return {
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

  const gamma = clamp(parameters.gamma, constraints.gamma);
  const channel = clamp(parameters.channel, constraints.channels);

  return {
    ...parameters,
    samplerate,
    low_freq: lowFreq,
    high_freq: highFreq,
    gamma: gamma,
    channel: channel,
  };
}
