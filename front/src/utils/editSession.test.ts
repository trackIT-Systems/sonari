import { afterEach, describe, expect, it } from "vitest";

import {
  endEditSession,
  getEditSession,
  isEditRequest,
  startEditSession,
  withEditSession,
} from "./editSession";

afterEach(() => endEditSession());

describe("edit sessions", () => {
  it("only marks requests that change sound events", () => {
    expect(isEditRequest("patch", "/api/v1/sound_event_annotations/detail/")).toBe(true);
    expect(isEditRequest("post", "/api/v1/annotation_tasks/bulk/sound_event_tags/replace/")).toBe(true);
    expect(isEditRequest("get", "/api/v1/sound_event_annotations/detail/")).toBe(false);
    expect(isEditRequest("post", "/api/v1/annotation_tasks/bulk/badges/")).toBe(false);
  });

  it("starts a new id per session and ends it", () => {
    const first = startEditSession();
    const second = startEditSession();
    expect(first).not.toBe(second);
    expect(getEditSession()).toBe(second);
    endEditSession();
    expect(getEditSession()).toBeNull();
  });

  it("gives a grouped action its own session and restores the previous one", async () => {
    const outer = startEditSession();
    let inner: string | null = null;
    await withEditSession(async () => {
      inner = getEditSession();
    });
    expect(inner).not.toBeNull();
    expect(inner).not.toBe(outer);
    expect(getEditSession()).toBe(outer);
  });
});
