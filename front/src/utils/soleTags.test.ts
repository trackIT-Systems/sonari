import { describe, expect, it } from "vitest";

import { countSoleTags, soundEventsTaggedOnlyWith } from "@/utils/soleTags";

const myotis = { key: "species", value: "Myotis" };
const noise = { key: "class", value: "noise" };
const events = [
  { id: 1, tags: [myotis] },
  { id: 2, tags: [myotis, noise] },
  { id: 3, tags: [noise] },
  { id: 4, tags: [] },
  { id: 5, tags: [{ ...myotis }] },
];

describe("sole tags", () => {
  it("finds the sound events whose only tag is the given one", () => {
    expect(soundEventsTaggedOnlyWith(events, myotis).map((e) => e.id)).toEqual([1, 5]);
    expect(soundEventsTaggedOnlyWith(events, noise).map((e) => e.id)).toEqual([3]);
  });

  it("counts each tag that is the only tag of some sound events", () => {
    expect(countSoleTags(events)).toEqual([
      { tag: myotis, count: 2 },
      { tag: noise, count: 1 },
    ]);
  });
});
