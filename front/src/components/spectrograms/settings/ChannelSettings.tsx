import { Control, Controller, useController } from "react-hook-form";

import { InputGroup } from "@/components/inputs/index";
import Select from "@/components/inputs/Select";
import Toggle from "@/components/inputs/Toggle";
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

  const mixChannels = useController({
    name: "mix_channels",
    control,
  });

  // Generate channel options based on the number of channels in the recording
  const channelOptions = Array.from({ length: maxChannels }, (_, i) => ({
    id: i,
    label: `Channel ${i + 1}`,
    value: i,
  }));

  return (
    <SettingsSection>
      <InputGroup
        name="mix_channels"
        label="Mix channels"
        help={
          mixChannels.field.value
            ? "All channels averaged to mono. Uncheck to select a single channel."
            : "Check to mix stereo (or multi-channel) audio to mono."
        }
      >
        <Toggle
          label="Mix channels"
          isSelected={mixChannels.field.value ?? false}
          onChange={mixChannels.field.onChange}
        />
      </InputGroup>
      {!mixChannels.field.value && (
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
      )}
    </SettingsSection>
  );
}
