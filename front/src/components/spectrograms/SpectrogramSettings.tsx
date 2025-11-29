import { zodResolver } from "@hookform/resolvers/zod";
import { memo, useEffect, useMemo, useState } from "react";
import { type Resolver, useForm } from "react-hook-form";

import Button from "@/components/Button";
import { SettingsIcon } from "@/components/icons";
import SlideOver from "@/components/SlideOver";
import Tooltip from "@/components/Tooltip";
import { SpectrogramParametersSchema } from "@/schemas";
import { debounce } from "@/utils/debounce";
import {
  computeConstraints,
  validateParameters,
} from "@/utils/spectrogram_parameters";

import AmplitudeSettings from "./settings/AmplitudeSettings";
import ChannelSettings from "./settings/ChannelSettings";
import ColorSettings from "./settings/ColorSettings";
import DeNoiseSettings from "./settings/DeNoiseSettings";
import FilteringSettings from "./settings/FilteringSettings";
import ResamplingSettings from "./settings/ResamplingSettings";
import STFTSettings from "./settings/STFTSettings";

import type { SpectrogramParameters } from "@/types";
import KeyboardKey from "../KeyboardKey";
import { SETTINGS_SHORTCUT } from "@/utils/keyboard";
import useKeyFilter from "@/hooks/utils/useKeyFilter";
import { useKeyPressEvent } from "react-use";
import  FreqLineSettings  from "./settings/FreqLineSettings";

const SpectrogramSettingForm = memo(function SpectrogramSettingForm({
  settings,
  samplerate: recordingSamplerate,
  maxChannels = 1,
  onChange,
}: {
  settings: SpectrogramParameters;
  samplerate: number;
  maxChannels?: number;
  onChange?: (parameters: SpectrogramParameters) => void;
}) {
  const initialSettings = useMemo(() => {
    const constraints = computeConstraints(recordingSamplerate, maxChannels);
    return validateParameters(settings, constraints);
  }, [settings, recordingSamplerate, maxChannels]);

  // Create a custom resolver that will first validate the parameters
  // with respect to the constraints computed from the recording samplerate
  // and then validate the parameters with respect to the schema
    const resolver = useMemo<Resolver<SpectrogramParameters>>(() => {
  const schemaResolver = zodResolver(SpectrogramParametersSchema);
  return async (values, context, options) => {
    const { resample, samplerate } = values;
    const currentSamplerate = resample
      ? samplerate || recordingSamplerate
      : recordingSamplerate;
    const constraints = computeConstraints(currentSamplerate, maxChannels);
    const validated = validateParameters(values, constraints);
    
    // Cast the options to match the expected type
    return await schemaResolver(validated, context, options as any);
  };
}, [recordingSamplerate, maxChannels]);

  const { handleSubmit, watch, control } = useForm({
    resolver,
    mode: "onBlur",
    reValidateMode: "onBlur",
    values: initialSettings,
  });

  const resample = watch("resample") as boolean;
  const formSamplerate = watch("samplerate") as number;
  // Use form samplerate if resampling, otherwise use recording samplerate
  const effectiveSamplerate = resample ? (formSamplerate || recordingSamplerate) : recordingSamplerate;
  const constraints = useMemo(
    () => computeConstraints(effectiveSamplerate, maxChannels),
    [effectiveSamplerate, maxChannels],
  );

  // When the form is submitted, we debounce the callback to avoid
  // calling it too often
  useEffect(() => {
    const debouncedCb = debounce(
      handleSubmit((data) => {
        onChange?.(data);
      }),
      300,
    );
    const subscription = watch(debouncedCb);
    return () => subscription.unsubscribe();
  }, [watch, handleSubmit, onChange]);

  return (
    <div className="flex flex-col gap-2">
      <ChannelSettings control={control} maxChannels={maxChannels} />
      <FreqLineSettings control={control}/>
      <AmplitudeSettings control={control} />
      <ColorSettings constraints={constraints} control={control} />
      <ResamplingSettings control={control} />
      <DeNoiseSettings control={control} />
      <STFTSettings constraints={constraints} control={control} />
      <FilteringSettings constraints={constraints} control={control} />
    </div>
  );
});

const SpectrogramSettings = memo(function SpectrogramSettings({
  settings,
  samplerate,
  maxChannels = 1,
  onChange,
  onReset,
  onSave,
}: {
  settings: SpectrogramParameters;
  samplerate: number;
  maxChannels?: number;
  onChange?: (parameters: SpectrogramParameters) => void;
  onReset?: () => void;
  onSave?: () => void;
}) {
  const [open, setOpen] = useState(false);

  useKeyPressEvent(useKeyFilter({ key: SETTINGS_SHORTCUT }), () => setOpen(true));

  return (
    <div>
      <Tooltip
        tooltip={
          <div className="inline-flex gap-2 items-center">
            Spectrogram settings
            <KeyboardKey code={SETTINGS_SHORTCUT} />
          </div>
        }
        placement="bottom"
      >
        <Button variant="secondary" onClick={() => setOpen(true)}>
          <SettingsIcon className="w-5 h-5" />
        </Button>
      </Tooltip>
      <SlideOver
        title={
          <div className="flex flex-row items-center justify-between">
            <span className="inline-flex items-center">
              <SettingsIcon className="inline-block mr-2 w-6 h-6" />
              Settings
            </span>
            <span className="inline-flex items-center gap-4">
              <Button mode="text" variant="warning" onClick={onReset}>
                Reset
              </Button>
              <Button mode="text" variant="primary" onClick={onSave}>
                Save
              </Button>
            </span>
          </div>
        }
        isOpen={open}
        onClose={() => setOpen(false)}
      >
        <SpectrogramSettingForm
          samplerate={samplerate}
          settings={settings}
          maxChannels={maxChannels}
          onChange={onChange}
        />
      </SlideOver>
    </div>
  );
});

export default SpectrogramSettings;
