import { useEffect } from "react";
import { type Control, Controller, useController, useWatch } from "react-hook-form";

import { InputGroup } from "@/components/inputs/index";
import Select from "@/components/inputs/Select";
import Toggle from "@/components/inputs/Toggle";
import { type ParameterConstraints } from "@/utils/spectrogram_parameters";
import {
  WINDOW_SIZE_OPTIONS,
  OVERLAP_OPTIONS,
  AUTO_STFT_TARGET_DURATION,
  AUTO_STFT_BASE_OVERLAP,
  AUTO_STFT_MIN_WINDOW_SIZE,
} from "@/constants";

import SettingsSection from "./SettingsSection";

import type { SpectrogramParameters } from "@/types";

type SelectOption = {
  id: string;
  value: string;
  label: string;
};

type SelectOptionsRecord = Record<string, SelectOption>;

const WINDOW_SIZE_SELECT_OPTIONS: SelectOptionsRecord = Object.fromEntries(
  WINDOW_SIZE_OPTIONS.map((size) => [
    size.toString(),
    {
      id: size.toString(),
      value: size.toString(),
      label: size.toString(),
    },
  ])
);

const OVERLAP_SELECT_OPTIONS: SelectOptionsRecord = Object.fromEntries(
  OVERLAP_OPTIONS.map((overlap) => [
    overlap.toString(),
    {
      id: overlap.toString(),
      value: overlap.toString(),
      label: `${overlap}%`,
    },
  ])
);

const SPECTROGRAM_WINDOWS: SelectOptionsRecord = {
  hann: { id: "hann", value: "hann", label: "Hann" },
  hamming: { id: "hamming", value: "hamming", label: "Hamming" },
  boxcar: { id: "boxcar", value: "boxcar", label: "Boxcar" },
  triang: { id: "triang", value: "triang", label: "Triangular" },
  blackman: { id: "blackman", value: "blackman", label: "Blackman" },
  bartlett: { id: "bartlett", value: "bartlett", label: "Bartlett" },
  flattop: { id: "flattop", value: "flattop", label: "Flat top" },
  parzen: { id: "parzen", value: "parzen", label: "Parzen" },
  bohman: { id: "bohman", value: "bohman", label: "Bohman" },
  blackmanharris: {
    id: "blackmanharris",
    value: "blackmanharris",
    label: "Blackman-Harris",
  },
  nuttall: { id: "nuttall", value: "nuttall", label: "Nuttall" },
  barthann: { id: "barthann", value: "barthann", label: "Bartlett-Hann" },
};

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
const AUTO_STFT_BASE_HOP_SIZE = 1024 * (1 - AUTO_STFT_BASE_OVERLAP / 100);

/**
 * Calculate optimal STFT parameters based on sample rate.
 * Maintains consistent audio duration (~0.002048s) across different sample rates.
 * Also scales overlap to maintain consistent hop size, preventing visual stretching.
 * 
 * Base case: 500 kHz → 1024 samples window, 96% overlap
 */
function calculateAutoSTFTParams(samplerate: number): {
  windowSize: number;
  overlap: number;
} {
  // Calculate target window size to maintain consistent duration
  const targetWindowSize = samplerate * AUTO_STFT_TARGET_DURATION;
  
  // Find nearest available option, with minimum of AUTO_STFT_MIN_WINDOW_SIZE
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

export default function STFTSettings({
  constraints,
  control,
}: {
  constraints: ParameterConstraints;
  control: Control<SpectrogramParameters>;
}) {
  const autoStft = useController({
    name: "auto_stft",
    control,
  });

  const windowSizeController = useController({
    name: "window_size_samples",
    control,
  });

  const overlapController = useController({
    name: "overlap_percent",
    control,
  });

  // Watch the samplerate, resample flag, and auto_stft to recalculate when they change
  const resample = useWatch({
    control,
    name: "resample",
  });

  const formSamplerate = useWatch({
    control,
    name: "samplerate",
  });

  const isAutoEnabled = useWatch({
    control,
    name: "auto_stft",
  }) ?? false;

  // Use form samplerate only if resampling is enabled, otherwise use recording samplerate from constraints
  const effectiveSamplerate = resample 
    ? (formSamplerate || constraints.samplerate) 
    : constraints.samplerate;

  // Recalculate STFT params when auto mode is enabled or samplerate changes
  // This updates the form display, but the actual values used for API calls
  // are computed by applyAutoSTFT in the parent component
  useEffect(() => {
    if (isAutoEnabled && effectiveSamplerate > 0) {
      const { windowSize, overlap } = calculateAutoSTFTParams(effectiveSamplerate);
      windowSizeController.field.onChange(windowSize);
      overlapController.field.onChange(overlap);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAutoEnabled, effectiveSamplerate]);

  return (
    <SettingsSection>
      <InputGroup
        name="autoStft"
        label="Auto"
        help={
          isAutoEnabled
            ? `Window size and overlap are automatically calculated for ${Math.round(effectiveSamplerate / 1000)} kHz.`
            : "Automatically calculate optimal window size and overlap based on sample rate."
        }
      >
        <Toggle
          label="Auto STFT"
          isSelected={isAutoEnabled}
          onChange={autoStft.field.onChange}
        />
      </InputGroup>
      <Controller
        name="window_size_samples"
        control={control}
        render={({ field, fieldState }) => {
          // Fallback for invalid values not in options
          const selectedOption = WINDOW_SIZE_SELECT_OPTIONS[field.value] ?? {
            id: String(field.value),
            value: String(field.value),
            label: `${field.value} (invalid)`,
          };
          return (
            <InputGroup
              name="windowSizeSamples"
              label="Window size"
              help="Select the FFT window size in samples."
              error={fieldState.error?.message}
            >
              <Select
                selected={selectedOption}
                onChange={field.onChange}
                options={Object.values(WINDOW_SIZE_SELECT_OPTIONS)}
                disabled={isAutoEnabled}
              />
            </InputGroup>
          );
        }}
      />
      <Controller
        name="overlap_percent"
        control={control}
        render={({ field, fieldState }) => {
          // Fallback for invalid values not in options
          const selectedOption = OVERLAP_SELECT_OPTIONS[field.value] ?? {
            id: String(field.value),
            value: String(field.value),
            label: `${field.value}% (invalid)`,
          };
          return (
            <InputGroup
              name="overlapPercent"
              label="Overlap"
              help="Select the percentage of overlap between consecutive windows."
              error={fieldState.error?.message}
            >
              <Select
                selected={selectedOption}
                onChange={field.onChange}
                options={Object.values(OVERLAP_SELECT_OPTIONS)}
                disabled={isAutoEnabled}
              />
            </InputGroup>
          );
        }}
      />
      <Controller
        name="window"
        control={control}
        render={({ field, fieldState }) => (
          <InputGroup
            name="window"
            label="Window"
            help="Select the window function to use for the STFT."
            error={fieldState.error?.message}
          >
            <Select
              selected={SPECTROGRAM_WINDOWS[field.value]}
              onChange={field.onChange}
              options={Object.values(SPECTROGRAM_WINDOWS)}
            />
          </InputGroup>
        )}
      />
    </SettingsSection>
  );
}
