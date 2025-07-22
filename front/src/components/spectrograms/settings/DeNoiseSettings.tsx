import { type Control, Controller } from "react-hook-form";

import { InputGroup } from "@/components/inputs/index";
import Toggle from "@/components/inputs/Toggle";

import SettingsSection from "./SettingsSection";

import type { SpectrogramParameters } from "@/types";

export default function DeNoiseSettings({
  control,
}: {
  control: Control<SpectrogramParameters>;
}) {
  return (
    <SettingsSection>
      <Controller
        name="pcen"
        control={control}
        render={({ field, fieldState }) => (
          <InputGroup
            name="denoise"
            label="De-noise"
            help={
              !field.value
                ? "De-noising is being applied. Uncheck to disable de-noising."
                : "Check to apply PCEN de-noising."
            }
            error={fieldState.error?.message}
          >
            <Toggle
              label="De-noise"
              isSelected={field.value ?? false}
              onChange={(denoise) => field.onChange(!denoise)}
            />
          </InputGroup>
        )}
      />
    </SettingsSection>
  );
}
