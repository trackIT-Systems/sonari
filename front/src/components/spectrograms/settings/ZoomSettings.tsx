import { Control, Controller, useController } from "react-hook-form";

import Button from "@/components/Button";
import { Input, InputGroup } from "@/components/inputs/index";
import Toggle from "@/components/inputs/Toggle";
import SettingsSection from "./SettingsSection";

import type { SpectrogramParameters } from "@/types";

const TIME_ZOOM_MIN = 0.01;

export default function ZoomSettings({
  control,
  currentTimeDurationSeconds,
  onUseCurrentZoom,
}: {
  control: Control<SpectrogramParameters>;
  currentTimeDurationSeconds?: number | null;
  onUseCurrentZoom?: (seconds: number) => void;
}) {
  const automatic = useController({ name: "time_zoom_automatic", control });

  return (
    <SettingsSection>
      <InputGroup
        name="time_zoom_automatic"
        label="Time zoom"
        help={
          automatic.field.value
            ? "Automatic: initial time window is computed from canvas and hop size."
            : "Parameter: use the saved duration below for the initial time window."
        }
      >
        <Toggle
          label={automatic.field.value ? "Automatic" : "Parameter"}
          isSelected={automatic.field.value ?? true}
          onChange={automatic.field.onChange}
        />
      </InputGroup>
      {!automatic.field.value && (
        <>
          <Controller
            name="time_zoom_duration_seconds"
            control={control}
            render={({ field, fieldState }) => (
              <InputGroup
                name="time_zoom_duration_seconds"
                label="Saved zoom duration (s)"
                help="Initial time window in seconds (min 0.01)."
                error={fieldState.error?.message}
              >
                <Input
                  type="number"
                  min={TIME_ZOOM_MIN}
                  step="any"
                  value={field.value ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    field.onChange(v === "" ? undefined : Number(v));
                  }}
                  onBlur={field.onBlur}
                />
              </InputGroup>
            )}
          />
          {onUseCurrentZoom != null &&
            currentTimeDurationSeconds != null &&
            currentTimeDurationSeconds >= TIME_ZOOM_MIN && (
              <Button
                variant="secondary"
                onClick={() => onUseCurrentZoom(currentTimeDurationSeconds)}
              >
                Use current zoom
              </Button>
            )}
        </>
      )}
    </SettingsSection>
  );
}
