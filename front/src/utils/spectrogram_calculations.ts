/**
 * Spectrogram Calculation Utilities
 * 
 * This module provides core mathematical functions for STFT (Short-Time Fourier Transform)
 * calculations. These utilities ensure consistency across the application when computing
 * spectrogram dimensions, hop sizes, and frequency bin mappings.
 * 
 * All calculations assume:
 * - Window size is specified in samples
 * - Overlap is specified as a percentage (0-100)
 * - Frequencies are in Hz
 * - Sample rates are in Hz
 */

import type { SpectrogramParameters } from "@/types";

/**
 * Calculate hop size in samples from window size and overlap percentage.
 * 
 * The hop size determines how far the STFT window moves forward for each frame.
 * It's the complement of the overlap:
 * - 75% overlap → 25% hop (window moves 25% of its size)
 * - 50% overlap → 50% hop (window moves 50% of its size)
 * 
 * @param windowSizeSamples - FFT window size in samples
 * @param overlapPercent - Overlap percentage between consecutive windows (0-100)
 * @returns Hop size in samples (how far window moves each frame)
 * 
 * @example
 * ```typescript
 * // With 1024 samples and 75% overlap
 * const hop = calculateHopSize(1024, 75);
 * // Returns 256 (window advances by 256 samples each frame)
 * ```
 */
function calculateHopSize(
  windowSizeSamples: number,
  overlapPercent: number
): number {
  const overlapSamples = Math.floor(windowSizeSamples * overlapPercent / 100);
  return windowSizeSamples - overlapSamples;
}

/**
 * Calculate the number of time frames for a given duration.
 * 
 * This determines how many STFT frames will be computed for the given
 * duration of audio. The number of frames depends on the hop size,
 * which is derived from the overlap percentage.
 * 
 * @param durationSeconds - Duration of audio in seconds
 * @param samplerate - Sample rate in Hz
 * @param windowSizeSamples - FFT window size in samples
 * @param overlapPercent - Overlap percentage (0-100)
 * @returns Number of time frames in the spectrogram
 * 
 * @example
 * ```typescript
 * // 1 second of audio at 44100 Hz with 1024 window and 75% overlap
 * const frames = calculateTimeFrames(1.0, 44100, 1024, 75);
 * // Returns ~172 frames
 * ```
 */
export function calculateTimeFrames(
  durationSeconds: number,
  samplerate: number,
  windowSizeSamples: number,
  overlapPercent: number
): number {
  const hopSize = calculateHopSize(windowSizeSamples, overlapPercent);
  const totalSamples = durationSeconds * samplerate;
  return Math.ceil(totalSamples / hopSize);
}

/**
 * Calculate overlap percentage from number of time frames.
 * 
 * This is the inverse of calculateTimeFrames - given the number of frames
 * in a spectrogram, determines what overlap percentage was used to generate them.
 * Useful for reverse-engineering spectrogram parameters or validating consistency.
 * 
 * @param timeFrames - Number of time frames in the spectrogram
 * @param durationSeconds - Duration of audio in seconds
 * @param samplerate - Sample rate in Hz
 * @param windowSizeSamples - FFT window size in samples
 * @returns Overlap percentage (0-100)
 * 
 * @example
 * ```typescript
 * // Given 172 frames over 1 second at 44100 Hz with 1024 window
 * const overlap = calculateOverlapPercent(172, 1.0, 44100, 1024);
 * // Returns ~75
 * ```
 */
export function calculateOverlapPercent(
  timeFrames: number,
  durationSeconds: number,
  samplerate: number,
  windowSizeSamples: number
): number {
  const totalSamples = durationSeconds * samplerate;
  const hopSize = totalSamples / timeFrames;
  const overlapSamples = windowSizeSamples - hopSize;
  const overlapPercent = (overlapSamples / windowSizeSamples) * 100;
  return Math.max(0, Math.min(100, overlapPercent)); // Clamp to 0-100
}

/**
 * Calculate hop duration in seconds.
 * 
 * This is the time interval between consecutive spectrogram frames.
 * A smaller hop duration means better time resolution (more frames per second).
 * 
 * @param windowSizeSamples - FFT window size in samples
 * @param overlapPercent - Overlap percentage (0-100)
 * @param samplerate - Sample rate in Hz
 * @returns Hop duration in seconds
 * 
 * @example
 * ```typescript
 * // With 1024 samples, 75% overlap, at 44100 Hz
 * const duration = calculateHopDuration(1024, 75, 44100);
 * // Returns ~0.0058 seconds (5.8 ms per frame)
 * ```
 */
export function calculateHopDuration(
  windowSizeSamples: number,
  overlapPercent: number,
  samplerate: number
): number {
  const hopSize = calculateHopSize(windowSizeSamples, overlapPercent);
  return hopSize / samplerate;
}

/**
 * Convert frequency range (Hz) to frequency bin indices.
 * 
 * Maps a frequency range in Hz to the corresponding indices in the
 * FFT output. Useful for cropping spectrograms to specific frequency ranges.
 * 
 * @param freqMin - Minimum frequency in Hz
 * @param freqMax - Maximum frequency in Hz
 * @param windowSizeSamples - FFT window size in samples
 * @param samplerate - Sample rate in Hz
 * @returns Object with minBin and maxBin indices
 * 
 * @example
 * ```typescript
 * // Find bins for 1000-5000 Hz range
 * const bins = frequencyRangeToBinRange(1000, 5000, 1024, 44100);
 * // Returns { minBin: 23, maxBin: 116 }
 * ```
 */
export function frequencyRangeToBinRange(
  freqMin: number,
  freqMax: number,
  windowSizeSamples: number,
  samplerate: number
): { minBin: number; maxBin: number } {
  return {
    minBin: Math.floor((freqMin * windowSizeSamples) / samplerate),
    maxBin: Math.ceil((freqMax * windowSizeSamples) / samplerate),
  };
}
