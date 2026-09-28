import { describe, expect, it } from "vitest";

import {
  isReplaceAllTag,
  REPLACE_ALL_TAGS_SENTINEL,
  soundEventAnnotationsForTagReplace,
} from "@/utils/soundEventTagReplace";
import type { SoundEventAnnotation, Tag } from "@/types";

const sea = (
  id: number,
  tags: Tag[],
): SoundEventAnnotation =>
  ({
    id,
    annotation_task_id: 1,
    recording_id: 1,
    geometry_type: "TimeInterval",
    geometry: { type: "TimeInterval", coordinates: [0, 1] },
    tags,
  }) as SoundEventAnnotation;

describe("soundEventAnnotationsForTagReplace", () => {
  const annotations = [
    sea(1, [{ key: "species", value: "a" }]),
    sea(2, []),
    sea(3, [{ key: "species", value: "b" }]),
  ];

  it("returns all annotations when old tag is null", () => {
    expect(
      soundEventAnnotationsForTagReplace(annotations, { oldTag: null }),
    ).toHaveLength(3);
  });

  it("filters by matching old tag", () => {
    const oldTag: Tag = { key: "species", value: "a" };
    const result = soundEventAnnotationsForTagReplace(annotations, { oldTag });
    expect(result.map((a) => a.id)).toEqual([1]);
  });

  it("treats all-tags sentinel as replace all", () => {
    const result = soundEventAnnotationsForTagReplace(annotations, {
      oldTag: REPLACE_ALL_TAGS_SENTINEL,
    });
    expect(result.map((a) => a.id)).toEqual([1, 3]);
  });

  it("scopes to a single annotation when provided", () => {
    const result = soundEventAnnotationsForTagReplace(annotations, {
      oldTag: null,
      scopeSoundEventAnnotation: annotations[1],
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });
});

describe("isReplaceAllTag", () => {
  it("detects the annotate UI sentinel", () => {
    expect(isReplaceAllTag(REPLACE_ALL_TAGS_SENTINEL)).toBe(true);
    expect(isReplaceAllTag({ key: "species", value: "bat" })).toBe(false);
  });
});
