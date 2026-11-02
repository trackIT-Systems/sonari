import { describe, expect, it, vi } from "vitest";
import type { AxiosInstance } from "axios";

import { DEFAULT_SPECTROGRAM_PARAMETERS, registerSpectrogramAPI } from "@/api/spectrograms";
import { registerWaveformsAPI } from "@/api/waveforms";
import type { Recording } from "@/types";

function fakeAxios() {
  const get = vi.fn(async () => ({ data: new Blob() }));
  return { instance: { get, defaults: { baseURL: "" } } as unknown as AxiosInstance, get };
}

function sentParams(get: ReturnType<typeof fakeAxios>["get"]) {
  const [, config] = get.mock.calls.at(-1) as unknown as [string, { params: Record<string, unknown> }];
  return config.params;
}

const recording = { id: 3, duration: 10, samplerate: 96000 } as Recording;
const segment = { min: 1, max: 2 };

describe("image requests", () => {
  it("waveform requests pass max_columns on to the backend", async () => {
    const { instance, get } = fakeAxios();
    await registerWaveformsAPI(instance).getBlob({
      recording,
      segment,
      parameters: { ...DEFAULT_SPECTROGRAM_PARAMETERS, max_columns: 123 },
    });
    expect(sentParams(get)).toMatchObject({ max_columns: 123, start_time: 1, end_time: 2 });
  });

  it("waveform requests leave max_columns out at full resolution", async () => {
    const { instance, get } = fakeAxios();
    await registerWaveformsAPI(instance).getBlob({
      recording,
      segment,
      parameters: DEFAULT_SPECTROGRAM_PARAMETERS,
    });
    expect(sentParams(get)).not.toHaveProperty("max_columns");
  });

  it("spectrogram requests pass the preview and detail options on", async () => {
    const { instance, get } = fakeAxios();
    await registerSpectrogramAPI(instance).getBlob({
      recording_id: 3,
      segment,
      parameters: {
        ...DEFAULT_SPECTROGRAM_PARAMETERS,
        max_columns: 456,
        max_rows: 320,
        lossy: true,
      },
    });
    expect(sentParams(get)).toMatchObject({ max_columns: 456, max_rows: 320, lossy: true });
  });
});
