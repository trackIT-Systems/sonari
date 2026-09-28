import type { SoundEventAnnotation, Tag } from "@/types";

export const REPLACE_ALL_TAGS_SENTINEL: Tag = { key: "all", value: "tags" };

export function isReplaceAllTag(tag: Tag | null | undefined): boolean {
  return tag?.key === "all" && tag?.value === "tags";
}

/**
 * Sound event annotations to update for a tag replace (matches annotate + bulk API rules).
 */
export function soundEventAnnotationsForTagReplace(
  soundEventAnnotations: SoundEventAnnotation[],
  options: {
    oldTag: Tag | null;
    replaceAll?: boolean;
    scopeSoundEventAnnotation?: SoundEventAnnotation | null;
  },
): SoundEventAnnotation[] {
  const { oldTag, replaceAll = false, scopeSoundEventAnnotation } = options;

  if (scopeSoundEventAnnotation) {
    return [scopeSoundEventAnnotation];
  }

  const effectiveReplaceAll = replaceAll || isReplaceAllTag(oldTag);

  if (effectiveReplaceAll) {
    return soundEventAnnotations.filter(
      (sea) => sea.tags != null && sea.tags.length > 0,
    );
  }

  if (oldTag != null) {
    return soundEventAnnotations.filter((sea) =>
      sea.tags?.some(
        (t) => t.key === oldTag.key && t.value === oldTag.value,
      ),
    );
  }

  return soundEventAnnotations;
}
