import { Control, Controller } from "react-hook-form";

import { InputGroup } from "@/components/inputs/index";
import Select from "@/components/inputs/Select";
import SettingsSection from "./SettingsSection";

import type { SpectrogramParameters } from "@/types";

export default function ChannelSettings({
  control,
  maxChannels = 1,
}: {
  control: Control<SpectrogramParameters>;
  maxChannels?: number;
}) {
  // Don't render channel selector for mono recordings
  if (maxChannels <= 1) {
    return null;
  }

  // Generate channel options based on the number of channels in the recording
  const channelOptions = Array.from({ length: maxChannels }, (_, i) => ({
    id: i,
    label: `Channel ${i + 1}`,
    value: i,
  }));

  return (
    <SettingsSection>
      <Controller
        name="channel"
        control={control}
        render={({ field, fieldState }) => (
          <InputGroup
            name="channel"
            label="Channel"
            help="Select which audio channel to display in the spectrogram."
            error={fieldState.error?.message}
          >
            <Select
              options={channelOptions}
              selected={channelOptions.find(opt => opt.value === field.value) || channelOptions[0]}
              onChange={(value) => field.onChange(value)}
            />
          </InputGroup>
        )}
      />
    </SettingsSection>
  );
}
