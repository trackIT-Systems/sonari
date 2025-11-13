import { type Control, Controller } from "react-hook-form";

import { InputGroup } from "@/components/inputs/index";
import Select from "@/components/inputs/Select";
import { type ParameterConstraints } from "@/utils/spectrogram_parameters";
import { WINDOW_SIZE_OPTIONS, OVERLAP_OPTIONS } from "@/constants";

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

export default function STFTSettings({
  constraints,
  control,
}: {
  constraints: ParameterConstraints;
  control: Control<SpectrogramParameters>;
}) {

  return (
    <SettingsSection>
      <Controller
        name="window_size_samples"
        control={control}
        render={({ field, fieldState }) => (
          <InputGroup
            name="windowSizeSamples"
            label="Window size"
            help="Select the FFT window size in samples."
            error={fieldState.error?.message}
          >
            <Select
              selected={WINDOW_SIZE_SELECT_OPTIONS[field.value]}
              onChange={field.onChange}
              options={Object.values(WINDOW_SIZE_SELECT_OPTIONS)}
            />
          </InputGroup>
        )}
      />
      <Controller
        name="overlap_percent"
        control={control}
        render={({ field, fieldState }) => (
          <InputGroup
            name="overlapPercent"
            label="Overlap"
            help="Select the percentage of overlap between consecutive windows."
            error={fieldState.error?.message}
          >
            <Select
              selected={OVERLAP_SELECT_OPTIONS[field.value]}
              onChange={field.onChange}
              options={Object.values(OVERLAP_SELECT_OPTIONS)}
            />
          </InputGroup>
        )}
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
