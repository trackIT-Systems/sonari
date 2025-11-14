/* Constants used throughout the application */

import { Dimensions } from "./types";

/* Default values for the settings of the STFT computation
 */
export const MAX_SAMPLERATE = 500_000;
export const MIN_SAMPLERATE = 4000;
export const MIN_DB = -140;
export const DEFAULT_WINDOW_SIZE_SAMPLES = 1024;
export const DEFAULT_OVERLAP_PERCENT = 75;
export const DEFAULT_WINDOW = "blackmanharris";
export const DEFAULT_SCALE = "dB";
export const DEFAULT_FILTER_ORDER = 5;
export const DEFAULT_CMAP = "plasma";
export const DEFAULT_CONF_PRESET = "hsr";

/* Available options for STFT computation
 */
export const WINDOW_SIZE_OPTIONS = [256, 512, 1024, 2048, 4096];
export const OVERLAP_OPTIONS = [50, 75, 87.5, 90, 92.5, 95, 96, 97, 98];

/** Absolute maximum frequency that can be handled by the app */
export const MAX_FREQ = 500_000;

/** Factor to zoom in and out of a spectrogram */
export const ZOOM_FACTOR = 0.2;

export const SPECTROGRAM_CANVAS_DIMENSIONS: Dimensions = {height: 384, width: 1000}
export const WAVEFORM_CANVAS_DIMENSIONS: Dimensions = {height: SPECTROGRAM_CANVAS_DIMENSIONS.height / 6, width: SPECTROGRAM_CANVAS_DIMENSIONS.width}
