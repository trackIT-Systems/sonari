import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AnnotationTaskFilter } from "@/api/annotation_tasks";
import useFilter from "@/hooks/utils/useFilter";
import type { Tag } from "@/types";

// The tag search asks the server; two buttons that pick a tag stand in for it.
vi.mock("@/components/tags/TagSearchBar", () => ({
  default: ({ onSelect }: { onSelect: (tag: Tag) => void }) => (
    <>
      <button onClick={() => onSelect({ key: "species", value: "Pip" } as Tag)}>pick Pip</button>
      <button onClick={() => onSelect({ key: "species", value: "Nyct" } as Tag)}>pick Nyct</button>
    </>
  ),
}));

import tasksFilterDefs from "./tasks";

const soundEventTags = tasksFilterDefs.find((def) => def.field === "sound_event_annotation_tag")!;

/** The sound event tag selector on a real filter; shows the applied filter and how often it changed. */
function Harness({ defaults, close }: { defaults: AnnotationTaskFilter; close: () => void }) {
  const filter = useFilter<AnnotationTaskFilter>({ defaults });
  return (
    <>
      <output data-testid="applied">{JSON.stringify(filter.filter)}</output>
      {soundEventTags.selector({ filter, close, setFilter: () => {} })}
    </>
  );
}

const applied = () => JSON.parse(screen.getByTestId("applied").textContent ?? "{}");

describe("sound event tag filter", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("applies the picked tags only when Apply is pressed, all at once", () => {
    const close = vi.fn();
    render(<Harness defaults={{}} close={close} />);

    fireEvent.click(screen.getByText("pick Pip"));
    act(() => vi.advanceTimersByTime(2000));
    fireEvent.click(screen.getByText("pick Nyct"));
    fireEvent.click(screen.getByText("AND"));
    act(() => vi.advanceTimersByTime(2000));
    // Well past the debounce: still nothing applied, so no query started
    expect(applied()).toEqual({});

    fireEvent.click(screen.getByText("Apply"));
    expect(applied()).toEqual({
      sound_event_annotation_tag: [
        { key: "species", value: "Pip" },
        { key: "species", value: "Nyct" },
      ],
      sound_event_annotation_tag_include_match: "and",
    });
    expect(close).toHaveBeenCalledOnce();
  });

  it("removes a tag only when Apply is pressed", () => {
    const defaults: AnnotationTaskFilter = {
      sound_event_annotation_tag: [
        { key: "species", value: "Pip" },
        { key: "species", value: "Nyct" },
      ] as AnnotationTaskFilter["sound_event_annotation_tag"],
    };
    render(<Harness defaults={defaults} close={() => {}} />);

    // The badge's remove button of the Nyct tag
    const nyct = screen.getByText("species: Nyct").parentElement!;
    fireEvent.click(nyct.querySelector("button")!);
    act(() => vi.advanceTimersByTime(2000));
    expect(applied()).toEqual(defaults);

    fireEvent.click(screen.getByText("Apply"));
    expect(applied()).toEqual({
      sound_event_annotation_tag: [{ key: "species", value: "Pip" }],
    });
  });

  it("clears the filter when Apply is pressed with every tag removed", () => {
    const defaults: AnnotationTaskFilter = {
      sound_event_annotation_tag: [{ key: "species", value: "Pip" }] as AnnotationTaskFilter["sound_event_annotation_tag"],
    };
    render(<Harness defaults={defaults} close={() => {}} />);

    const pip = screen.getByText("species: Pip").parentElement!;
    fireEvent.click(pip.querySelector("button")!);
    fireEvent.click(screen.getByText("Apply"));
    expect(applied()).toEqual({});
  });
});
