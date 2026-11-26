import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import releaseNotesByTag from "@/data/releaseNotes.json";
import ReleaseNotesDialog from "@/components/ReleaseNotesDialog";
import { getReleaseNotes, type ReleaseNotesEntry } from "@/utils/version";

const entries = Object.entries(releaseNotesByTag as Record<string, ReleaseNotesEntry>);

describe("releaseNotes.json", () => {
  it.each(entries)("%s has highlights with a title, each title once", (_tag, entry) => {
    expect(entry.highlights.length).toBeGreaterThan(0);
    for (const highlight of entry.highlights) {
      expect(typeof highlight.title).toBe("string");
      expect(highlight.title.trim()).not.toBe("");
    }
    // The dialog keys its list by title
    const titles = entry.highlights.map((h) => h.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("finds each version's notes by its tag", () => {
    for (const [tag, entry] of entries) {
      expect(getReleaseNotes(tag)).toBe(entry);
    }
  });
});

describe("ReleaseNotesDialog", () => {
  afterEach(cleanup);

  it.each(entries)("shows every highlight of %s", (tag, entry) => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ReleaseNotesDialog tag={tag} notes={entry} isOpen onClose={() => {}} />);
    expect(screen.getByText(`What's new in ${tag}`)).toBeTruthy();
    for (const highlight of entry.highlights) {
      expect(screen.getByText(highlight.title)).toBeTruthy();
    }
    // e.g. React's duplicate key warning
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});
