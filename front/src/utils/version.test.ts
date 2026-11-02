import { describe, expect, it } from "vitest";

import {
  getReleaseNotes,
  getReleaseTag,
  getSidebarVersionLabel,
} from "@/utils/version";

describe("getReleaseTag", () => {
  it("returns the tag when the version is already a tag", () => {
    expect(getReleaseTag("2026.9.6")).toBe("2026.9.6");
  });

  it("strips git describe suffixes", () => {
    expect(getReleaseTag("2026.9.6-5-gabc123")).toBe("2026.9.6");
  });

  it("leaves non-describe versions unchanged", () => {
    expect(getReleaseTag("unknown")).toBe("unknown");
  });
});

describe("getSidebarVersionLabel", () => {
  it("shows month.patch from a Docker-style release tag", () => {
    expect(getSidebarVersionLabel("2026.9.6")).toBe("9.6");
    expect(getSidebarVersionLabel("2026.10.2")).toBe("10.2");
  });

  it("uses the release tag after stripping git describe", () => {
    expect(getSidebarVersionLabel("2026.9.6-5-gabc123")).toBe("9.6");
  });
});

describe("getReleaseNotes", () => {
  it("returns highlights for a known tag", () => {
    const notes = getReleaseNotes("2026.9.6");
    expect(notes).not.toBeNull();
    expect(notes?.highlights.length).toBeGreaterThan(0);
  });

  it("returns null when there is no entry for the tag", () => {
    expect(getReleaseNotes("1999.1.1")).toBeNull();
  });
});
