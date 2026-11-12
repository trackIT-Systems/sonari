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
    /**
     * Several selected sound events: only these are changed. A replace of a
     * specific tag only touches the ones carrying it; adding goes to all.
     */
    scopeSoundEventAnnotations?: SoundEventAnnotation[] | null;
  },
): SoundEventAnnotation[] {
  const { oldTag, replaceAll = false, scopeSoundEventAnnotation, scopeSoundEventAnnotations } = options;

  const effectiveReplaceAll = replaceAll || isReplaceAllTag(oldTag);

  if (scopeSoundEventAnnotations && scopeSoundEventAnnotations.length > 0) {
    if (oldTag != null && !effectiveReplaceAll) {
      return scopeSoundEventAnnotations.filter((sea) =>
        sea.tags?.some((t) => t.key === oldTag.key && t.value === oldTag.value),
      );
    }
    return scopeSoundEventAnnotations;
  }

  if (scopeSoundEventAnnotation) {
    return [scopeSoundEventAnnotation];
  }

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

function sameTag(a: Tag, b: Tag): boolean {
  return a.key === b.key && a.value === b.value;
}

type SoundEventTagMutation = (params: {
  soundEventAnnotation: SoundEventAnnotation;
  tag: Tag;
}) => Promise<SoundEventAnnotation>;

/**
 * Remove `tagsToRemove` from one sound event, then add `newTag`. Each call
 * gets the sound event the previous one returned: the mutations skip a tag
 * the passed sound event already has (or lacks), so passing the state from
 * before the removes would skip adding a tag that was just removed and leave
 * the sound event untagged. The new tag itself is never removed.
 */
export async function replaceTagsOfSoundEventAnnotation(
  soundEventAnnotation: SoundEventAnnotation,
  tagsToRemove: Tag[],
  newTag: Tag | null,
  mutations: { addTag: SoundEventTagMutation; removeTag: SoundEventTagMutation },
): Promise<SoundEventAnnotation> {
  let current = soundEventAnnotation;
  for (const tag of tagsToRemove) {
    if (newTag != null && sameTag(tag, newTag)) continue;
    if (!current.tags?.some((t) => sameTag(t, tag))) continue;
    current = await mutations.removeTag({ soundEventAnnotation: current, tag });
  }
  if (newTag != null && !current.tags?.some((t) => sameTag(t, newTag))) {
    current = await mutations.addTag({ soundEventAnnotation: current, tag: newTag });
  }
  return current;
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
