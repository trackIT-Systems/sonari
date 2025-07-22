import { type Control, Controller, useController } from "react-hook-form";

import { Input, InputGroup } from "@/components/inputs/index";
import Toggle from "@/components/inputs/Toggle";
import { useState } from "react";
import SettingsSection from "./SettingsSection";

import type { SpectrogramParameters } from "@/types";

const PRESET_FREQS = [20000, 28000, 38000, 45000, 55000];

export default function FreqLineSettings({
  control,
}: {
  control: Control<SpectrogramParameters>;
}) {
  const {
    field: freqLinesField,
    fieldState: freqLinesState,
  } = useController({
    name: "freqLines",
    control,
  });

  const [customFreq, setCustomFreq] = useState<number | "">("");

  const toggleFreq = (value: number) => {
    const exists = freqLinesField.value?.includes(value);
    const newFreqs = exists
      ? freqLinesField.value.filter((v: number) => v !== value)
      : [...(freqLinesField.value ?? []), value];
    freqLinesField.onChange(newFreqs);
  };

  const addCustomFreq = () => {
    const freq = Number(customFreq);
    if (
      !isNaN(freq) &&
      freq > 0 &&
      !freqLinesField.value?.includes(freq)
    ) {
      freqLinesField.onChange([...(freqLinesField.value ?? []), freq]);
      setCustomFreq(""); // Reset input
    }
  };

  return (
    <SettingsSection>
      <InputGroup
        name="freqLines"
        label="Frequency Lines"
        help="Toggle standard frequency lines or add a custom frequency (in kHz)."
        error={freqLinesState.error?.message}
      >
        <div className="flex flex-wrap gap-4 mb-2">
          {PRESET_FREQS.map((freq) => (
            <div key={freq} className="flex flex-col items-center">
              <Toggle
                isSelected={freqLinesField.value?.includes(freq)}
                onChange={() => toggleFreq(freq)}
              />
              <span className="text-xs text-gray-300 mt-1">
                {freq / 1000} kHz
              </span>
            </div>
          ))}
          {[...(freqLinesField.value ?? [])]
            .filter((freq) => !PRESET_FREQS.includes(freq))
            .map((freq) => (
              <div key={freq} className="flex flex-col items-center">
                <Toggle
                  isSelected={true}
                  onChange={() => toggleFreq(freq)}
                />
                <span className="text-xs text-gray-300 mt-1">
                  {freq / 1000} kHz (custom)
                </span>
              </div>
            ))}
        </div>
        <div className="flex gap-2 mt-2 items-center">
          <Input
            type="number"
            placeholder="Custom kHz"
            value={customFreq === "" ? "" : customFreq / 1000} // Show in kHz
            onChange={(e) => setCustomFreq(Number(e.target.value) * 1000)} // Store in Hz
            min={0}
          />
          <button
            type="button"
            onClick={addCustomFreq}
            className="px-3 py-1 rounded bg-blue-500 text-white hover:bg-blue-600 text-sm"
          >
            Add
          </button>
        </div>
      </InputGroup>
    </SettingsSection>
  );
}