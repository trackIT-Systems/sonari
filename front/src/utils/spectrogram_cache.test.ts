import { describe, expect, it } from "vitest";

import { spectrogramCache } from "@/utils/spectrogram_cache";
import type { SpectrogramParameters, SpectrogramWindow } from "@/types";

const parameters = {} as SpectrogramParameters;
const segment = (n: number): SpectrogramWindow => ({ time: { min: n, max: n + 1 }, freq: { min: 0, max: 1 } });
const image = () => ({ complete: true, decode: () => Promise.resolve() }) as unknown as HTMLImageElement;
const MB = 1024 * 1024;

describe("spectrogramCache", () => {
  it("drops the least recently used image, not the first one added", async () => {
    spectrogramCache.clear();
    // The cache holds 1024 MB: three 400 MB images do not fit
    await spectrogramCache.set(1, segment(0), parameters, image(), 400 * MB);
    await spectrogramCache.set(1, segment(1), parameters, image(), 400 * MB);
    // Reading the first one makes it recently used
    expect(spectrogramCache.get(1, segment(0), parameters)).not.toBeNull();
    await spectrogramCache.set(1, segment(2), parameters, image(), 400 * MB);

    expect(spectrogramCache.get(1, segment(0), parameters)).not.toBeNull();
    expect(spectrogramCache.get(1, segment(1), parameters)).toBeNull();
    expect(spectrogramCache.get(1, segment(2), parameters)).not.toBeNull();
    expect(spectrogramCache.size()).toBe(800 * MB);
    spectrogramCache.clear();
  });
});
