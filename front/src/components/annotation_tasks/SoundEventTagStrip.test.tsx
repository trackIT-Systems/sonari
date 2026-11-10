import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SoundEventTagStrip } from "@/components/annotation_tasks/AnnotationTaskTags";
import type { SoundEventAnnotation } from "@/types";

const myotis = { key: "species", value: "Myotis" };
const social = { key: "type", value: "social" };
const events = [
  { id: 1, tags: [myotis, social] },
  { id: 2, tags: [myotis] },
  { id: 3, tags: [] },
] as unknown as SoundEventAnnotation[];

afterEach(cleanup);

const strip = () => screen.getByLabelText("Sound event tags");

describe("SoundEventTagStrip", () => {
  it("shows every tag with how many sound events carry it", () => {
    render(<SoundEventTagStrip soundEventAnnotations={events} />);
    expect(strip().querySelector('[title="species: Myotis (2)"]')).toBeTruthy();
    expect(strip().querySelector('[title="type: social (1)"]')).toBeTruthy();
  });

  it("leaves out hidden tag kinds", () => {
    render(
      <SoundEventTagStrip
        soundEventAnnotations={events}
        tagVisibility={{ species: true, passes: true, type: false }}
      />,
    );
    expect(strip().querySelector('[title="species: Myotis (2)"]')).toBeTruthy();
    expect(strip().querySelector('[title^="type:"]')).toBeNull();
  });

  it("the x on a tag removes it", () => {
    const onRemoveTag = vi.fn();
    render(<SoundEventTagStrip soundEventAnnotations={events} onRemoveTag={onRemoveTag} />);
    const chip = strip().querySelector('[title="species: Myotis (2)"]')!.parentElement!;
    fireEvent.click(chip.querySelector("button")!);
    expect(onRemoveTag).toHaveBeenCalledWith(myotis);
  });

  it("says so when there are no tags", () => {
    render(<SoundEventTagStrip soundEventAnnotations={[]} />);
    expect(strip().textContent).toContain("No sound event tags");
  });
});
