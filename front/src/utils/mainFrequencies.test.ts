import { describe, expect, it } from "vitest";

import { groupMainFrequencies, median } from "@/utils/mainFrequencies";
import type { SoundEventAnnotation, Tag } from "@/types";

const species = (value: string): Tag => ({ key: "species", value });
const type = (value: string): Tag => ({ key: "type", value });

const sea = (id: number, start: number, tags: Tag[]): SoundEventAnnotation =>
  ({
    id,
    annotation_task_id: 1,
    recording_id: 1,
    geometry_type: "BoundingBox",
    geometry: { type: "BoundingBox", coordinates: [start, 20000, start + 0.005, 60000] },
    tags,
  }) as unknown as SoundEventAnnotation;

describe("median", () => {
  it("handles odd, even and empty lists", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("groupMainFrequencies", () => {
  it("groups calls by species and type with their statistics", () => {
    const seas = [
      sea(1, 0.3, [species("Pipistrellus pipistrellus"), type("echolocation")]),
      sea(2, 0.1, [species("Pipistrellus pipistrellus"), type("echolocation")]),
      sea(3, 0.2, [species("Pipistrellus pipistrellus"), type("social")]),
      sea(4, 0.4, [species("Myotis daubentonii")]),
      sea(5, 0.5, []),
      sea(6, 0.6, [species("Pipistrellus pipistrellus"), type("echolocation")]),
    ];
    const frequencies = new Map<number, number | null>([
      [1, 46000],
      [2, 45000],
      [3, 20000],
      [4, 41000],
      [5, 30000],
      [6, null],
    ]);

    const groups = groupMainFrequencies(seas, frequencies);

    expect(groups.map((g) => [g.species, g.type, g.calls.length])).toEqual([
      ["Myotis daubentonii", null, 1],
      ["Pipistrellus pipistrellus", "echolocation", 3],
      ["Pipistrellus pipistrellus", "social", 1],
      [null, null, 1],
    ]);
    const echolocation = groups[1];
    // In time order; the unmeasured call counts but has no frequency
    expect(echolocation.calls.map((c) => c.soundEventAnnotation.id)).toEqual([2, 1, 6]);
    expect(echolocation.median).toBe(45500);
    expect(echolocation.min).toBe(45000);
    expect(echolocation.max).toBe(46000);
  });

  it("puts a sound event with several species in a group of its own", () => {
    const groups = groupMainFrequencies(
      [sea(1, 0, [species("B"), species("A")])],
      new Map([[1, 40000]]),
    );
    expect(groups[0].species).toBe("A / B");
  });

  it("leaves the statistics empty while nothing is measured", () => {
    const groups = groupMainFrequencies([sea(1, 0, [species("A")])], new Map());
    expect(groups[0].median).toBeNull();
    expect(groups[0].min).toBeNull();
  });
});
