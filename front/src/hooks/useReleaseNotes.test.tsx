import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useReleaseNotes } from "@/hooks/useReleaseNotes";
import {
  getReleaseNotesSeenKey,
  setSeenReleaseTag,
} from "@/utils/releaseNotesStorage";

const USER_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const TAG = "2026.9.6";

vi.mock("@/utils/version", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/utils/version")>();
  return {
    ...actual,
    getReleaseTag: () => TAG,
    getReleaseNotes: (tag?: string) => {
      const key = tag ?? TAG;
      if (key === TAG) {
        return {
          highlights: [{ title: "Test feature", description: "Details" }],
        };
      }
      return null;
    },
  };
});

describe("useReleaseNotes", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("auto-opens when notes exist and the user has not dismissed this tag", async () => {
    const { result } = renderHook(() => useReleaseNotes(USER_A));

    await waitFor(() => {
      expect(result.current.isOpen).toBe(true);
    });
  });

  it("stays closed when the user already dismissed this tag", async () => {
    setSeenReleaseTag(USER_A, TAG);

    const { result } = renderHook(() => useReleaseNotes(USER_A));

    await waitFor(() => {
      expect(result.current.hasNotes).toBe(true);
    });
    expect(result.current.isOpen).toBe(false);
  });

  it("persists dismissal to localStorage", async () => {
    const { result } = renderHook(() => useReleaseNotes(USER_A));

    await waitFor(() => {
      expect(result.current.isOpen).toBe(true);
    });

    act(() => {
      result.current.dismiss();
    });

    expect(result.current.isOpen).toBe(false);
    expect(localStorage.getItem(getReleaseNotesSeenKey(USER_A))).toBe(TAG);
  });

  it("does not treat one user's dismissal as read for another user", async () => {
    setSeenReleaseTag(USER_A, TAG);

    const { result } = renderHook(() => useReleaseNotes(USER_B));

    await waitFor(() => {
      expect(result.current.isOpen).toBe(true);
    });
  });
});
