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

export const SPECIES_TAG_KEY = "species";
export const GROUP_TAG_KEY = "group";

/** Species (tag values) replaced by each group tag; mirrors back/src/sonari/utils/bat_groups.py. */
export const BAT_GROUP_SPECIES: Record<string, string[]> = {
  Myotis: [
    "Myotis alcathoe",
    "Myotis mystacinus/brandtii",
    "Myotis brandtii",
    "Myotis mystacinus",
    "Myotis bechsteinii",
    "Myotis daubentonii",
    "Myotis myotis",
    "Myotis nattereri",
    "Myotis emarginatus",
    "Myotis dasycneme",
  ],
  Nyctaloid: [
    "Eptesicus serotinus",
    "Eptesicus nilsonii",
    "Nyctalus leisleri",
    "Nyctalus noctula",
    "Vespertilio murinus",
  ],
  Pipistrelloid: [
    "Pipistrellus pipistrellus",
    "Pipistrellus pygmaeus",
    "Pipistrellus nathusii",
  ],
};

export const BAT_GROUPS = Object.keys(BAT_GROUP_SPECIES);

export function isSpeciesOfGroup(tag: Tag, group: string): boolean {
  return (
    tag.key === SPECIES_TAG_KEY &&
    (BAT_GROUP_SPECIES[group] ?? []).includes(tag.value)
  );
}

/** Groups that have at least one member species in `tagCounts`, with the summed count. */
export function groupReplaceOptions(
  tagCounts: { tag: Tag; count: number }[],
): { group: string; count: number }[] {
  return BAT_GROUPS.map((group) => ({
    group,
    count: tagCounts
      .filter(({ tag }) => isSpeciesOfGroup(tag, group))
      .reduce((sum, { count }) => sum + count, 0),
  })).filter(({ count }) => count > 0);
}
