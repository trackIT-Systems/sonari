import { afterEach, describe, expect, it } from "vitest";

import {
  getReleaseNotesSeenKey,
  getSeenReleaseTag,
  setSeenReleaseTag,
} from "@/utils/releaseNotesStorage";

const USER_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

describe("releaseNotesStorage", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("uses a per-user localStorage key", () => {
    expect(getReleaseNotesSeenKey(USER_A)).toBe(
      `sonari-release-notes-seen:${USER_A}`,
    );
    expect(getReleaseNotesSeenKey(USER_B)).not.toBe(
      getReleaseNotesSeenKey(USER_A),
    );
  });

  it("stores the dismissed tag per user", () => {
    setSeenReleaseTag(USER_A, "2026.9.6");
    expect(getSeenReleaseTag(USER_A)).toBe("2026.9.6");
    expect(getSeenReleaseTag(USER_B)).toBeNull();
  });
});
