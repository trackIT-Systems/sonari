import { describe, expect, it } from "vitest";

import {
  formatActiveFilterSummary,
  joinFilterSummary,
} from "./formatActiveFilterSummary";
import type { FilterDef } from "@/components/filters/FilterMenu";
import type { Filter } from "@/hooks/utils/useFilter";

type TestFilter = {
  annotation_project?: { id: number };
  empty?: boolean;
  sound_event_annotation_tag?: { key: string; value: string; exclude?: boolean }[];
};

const defs: FilterDef<TestFilter>[] = [
  {
    field: "empty",
    name: "Empty",
    selector: () => null,
    render: () => null,
  },
  {
    field: "sound_event_annotation_tag",
    name: "Tag",
    selector: () => null,
    render: () => null,
  },
];

function mockFilter(filterState: TestFilter): Filter<TestFilter> {
  return {
    filter: filterState,
    set: () => {},
    get: (key) => filterState[key],
    clear: () => {},
    reset: () => {},
    submit: () => {},
    isFixed: (key) => key === "annotation_project",
    size: 0,
  };
}

describe("formatActiveFilterSummary", () => {
  it("formats multiple active filters", () => {
    const lines = formatActiveFilterSummary(
      mockFilter({
        annotation_project: { id: 1 },
        empty: false,
        sound_event_annotation_tag: [
          { key: "species", value: "Pipistrellus nathusii" },
        ],
      }),
      defs,
    );
    expect(lines).toEqual([
      "Empty: No",
      "Tag: Include species: Pipistrellus nathusii",
    ]);
    expect(joinFilterSummary(lines)).toContain("Empty: No");
    expect(joinFilterSummary(lines)).toContain("Pipistrellus nathusii");
  });
});
