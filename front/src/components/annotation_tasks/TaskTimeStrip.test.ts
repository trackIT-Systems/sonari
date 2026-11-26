import { describe, expect, it } from "vitest";

import { formatOffset, taskSpecies } from "./TaskTimeStrip";

import type { AnnotationTask } from "@/types";

describe("formatOffset", () => {
  it("reads naturally at every scale", () => {
    expect(formatOffset(-4.4)).toBe("−4 s");
    expect(formatOffset(12)).toBe("+12 s");
    expect(formatOffset(-130)).toBe("−2 min 10 s");
    expect(formatOffset(120)).toBe("+2 min");
    expect(formatOffset(25 * 60 + 30)).toBe("+25 min");
    expect(formatOffset(-(3600 + 5 * 60))).toBe("−1 h 5 min");
    expect(formatOffset(3 * 86400)).toBe("+3 d");
  });
});

describe("taskSpecies", () => {
  const tag = (value: string) => ({ key: "species", value });

  it("lists each species once", () => {
    const task = { sound_event_tags: [tag("mbec"), tag("mdau"), tag("mbec")] } as unknown as AnnotationTask;
    expect(taskSpecies(task)).toEqual(["mbec", "mdau"]);
  });

  it("falls back to the sound events' tags", () => {
    const task = {
      sound_event_tags: [],
      sound_event_annotations: [{ tags: [tag("pipi")] }, { tags: [tag("pipi"), tag("nnoc")] }],
    } as unknown as AnnotationTask;
    expect(taskSpecies(task)).toEqual(["pipi", "nnoc"]);
  });
});

describe("taskSpecies without other tags", () => {
  it("leaves out passes and call types", () => {
    const task = {
      sound_event_tags: [
        { key: "species", value: "mbec" },
        { key: "type", value: "feeding-buzz" },
        { key: "pass", value: "1" },
      ],
    } as unknown as AnnotationTask;
    expect(taskSpecies(task)).toEqual(["mbec"]);
  });
});
