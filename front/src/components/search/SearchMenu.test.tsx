import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import SearchMenu from "./SearchMenu";

type Option = { tag: { key: string; value: string } };

const OPTIONS: Option[] = Array.from({ length: 60 }, (_, i) => ({
  tag: { key: "species", value: `Species ${i}` },
}));

describe("SearchMenu", () => {
  it("caps the static option list height so a long list scrolls instead of growing the page", () => {
    // Regression test: a `fixed inset-0` popover (e.g. the tag-cycle and
    // delete-tag menus in AnnotateTasks) with an unbounded-height option list
    // can grow past the viewport and put a scrollbar on the whole page. For a
    // view that sizes itself off the viewport (the full page spectrogram),
    // that scrollbar shrinks the available width and visibly shrinks the
    // spectrogram. Capping the list's height keeps the popover's own size
    // bounded regardless of how many options it holds.
    render(
      <SearchMenu
        options={OPTIONS}
        fields={["tag.key", "tag.value"]}
        renderOption={(o: Option) => o.tag.value}
        getOptionKey={(o: Option) => o.tag.value}
        limit={100}
        static={true}
      />,
    );

    const list = screen.getByRole("listbox");
    expect(list.className).toMatch(/\bmax-h-60\b/);
    expect(list.className).toMatch(/\boverflow-auto\b/);
  });
});
