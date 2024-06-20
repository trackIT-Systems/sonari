import { type Control, Controller, useController } from "react-hook-form";

import { InputGroup } from "@/components/inputs/index";
import Select from "@/components/inputs/Select";
import Toggle from "@/components/inputs/Toggle";
import RangeSlider from "@/components/inputs/RangeSlider";
import { MIN_DB } from "@/constants";

import SettingsSection from "./SettingsSection";

import type { SpectrogramParameters } from "@/types";

const AMPLITUDE_SCALES: Record<
  string,
  { id: string; value: string; label: string }
> = {
  dB: { id: "dB", value: "dB", label: "decibels (dB)" },
  amplitude: { id: "amplitude", value: "amplitude", label: "amplitude" },
  power: { id: "power", value: "power", label: "power" },
};

export default function AmplitudeSettings({
  control,
}: {
  control: Control<SpectrogramParameters>;
}) {

  const minDB = useController({
    control,
    name: "min_dB",
  });

  const maxDB = useController({
    control,
    name: "max_dB",
  });

  return (
    <SettingsSection>
      <Controller
        name="scale"
        control={control}
        render={({ field, fieldState }) => (
          <InputGroup
            name="scale"
            label="Amplitude scale"
            help="Select the amplitude scale to use for the spectrogram."
            error={fieldState.error?.message}
          >
            <Select
              selected={AMPLITUDE_SCALES[field.value]}
              onChange={field.onChange}
              options={Object.values(AMPLITUDE_SCALES)}
            />
          </InputGroup>
        )}
      />
      <Controller
        name="normalize"
        control={control}
        render={({ field, fieldState }) => (
          <InputGroup
            name="normalize"
            label="Normalize amplitudes"
            help="Toggle to normalize amplitude values."
            error={fieldState.error?.message}
          >
            <Toggle
              label="Normalize"
              isSelected={field.value}
              onChange={field.onChange}
            />
          </InputGroup>
        )}
      />
      <Controller
        name="clamp"
        control={control}
        render={({ field, fieldState }) => (
          <InputGroup
          name="clampValues"
          label="Min and max amplitude values"
          help="Select the min and max amplitude values to clamp to."
          error={
            minDB.fieldState.error?.message || maxDB.fieldState.error?.message
          }
          >
            <RangeSlider
              label="Filtering"
              minValue={MIN_DB}
              maxValue={0}
              step={2}
              value={[minDB.field.value, maxDB.field.value]}
              onChange={(value) => {
                const [min, max] = value as number[];
                minDB.field.onChange(min);
                maxDB.field.onChange(max);
              }}
            />
          </InputGroup>
        )}
      />
    </SettingsSection>
  );
}
