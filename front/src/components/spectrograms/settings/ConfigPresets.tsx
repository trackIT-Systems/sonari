import { type Control, Controller } from "react-hook-form";

import { InputGroup } from "@/components/inputs/index";
import Select from "@/components/inputs/Select";

import type { SpectrogramParameters } from "@/types";

const CONFIG_PRESETS: Record<
  string,
  {
    id: string;
    value: string;
    label: string;
  }
> = {
  hsr: { id: "hsr", value: "hsr", label: "High samplerate" },
  hsrn: { id: "hsrn", value: "hsrn", label: "High samplerate (noisy)" },
  lsr: { id: "lsr", value: "lsr", label: "Low samplerate" },
  lsrn: { id: "lsrn", value: "lsrn", label: "Low samplerate (noisy)" },
};

export default function ConfigPresets({
  control,
}: {
  control: Control<SpectrogramParameters>;
}) {

  return (
      <Controller
        name="conf_preset"
        control={control}
        render={({ field, fieldState }) => (
          <InputGroup
            name="conf_preset"
            label="Configuration Templates"
            help="Select a configuration fitting your audio"
            error={fieldState.error?.message}
          >
            <Select
              selected={CONFIG_PRESETS[field.value]}
              onChange={field.onChange}
              options={Object.values(CONFIG_PRESETS)}
            />
          </InputGroup>
        )}
      />
  );
}
