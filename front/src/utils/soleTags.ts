import type { SoundEventAnnotation, Tag } from "@/types";

const sameTag = (a: Tag, b: Tag) => a.key === b.key && a.value === b.value;

/** The sound events whose only tag is `tag` (what "delete sound events by tag" deletes). */
export function soundEventsTaggedOnlyWith<T extends Pick<SoundEventAnnotation, "tags">>(
  soundEventAnnotations: T[],
  tag: Tag,
): T[] {
  return soundEventAnnotations.filter((sea) => sea.tags?.length === 1 && sameTag(sea.tags[0], tag));
}

/** Each tag that is the only tag of some sound events, with how many. */
export function countSoleTags(
  soundEventAnnotations: Pick<SoundEventAnnotation, "tags">[],
): { tag: Tag; count: number }[] {
  const byTag = new Map<string, { tag: Tag; count: number }>();
  for (const sea of soundEventAnnotations) {
    if (sea.tags?.length !== 1) continue;
    const tag = sea.tags[0];
    const key = `${tag.key}-${tag.value}`;
    const entry = byTag.get(key);
    if (entry) entry.count += 1;
    else byTag.set(key, { tag, count: 1 });
  }
  return Array.from(byTag.values());
}
