import type { SoundEventAnnotation } from "@/types";
import { SPECIES_TAG_KEY } from "@/utils/soundEventTagReplace";

/** Tag key of the call type (e.g. echolocation, social) */
export const CALL_TYPE_TAG_KEY = "type";

export type MainFrequencyCall = {
  soundEventAnnotation: SoundEventAnnotation;
  /** Hz; null while loading or where none can be measured */
  frequency: number | null;
};

export type MainFrequencyGroup = {
  key: string;
  /** Null: no species tag */
  species: string | null;
  /** Null: no call type tag */
  type: string | null;
  /** In time order */
  calls: MainFrequencyCall[];
  /** Over the calls with a frequency; null without any */
  median: number | null;
  min: number | null;
  max: number | null;
};

function tagValues(soundEventAnnotation: SoundEventAnnotation, key: string): string | null {
  const values = (soundEventAnnotation.tags ?? []).filter((tag) => tag.key === key).map((tag) => tag.value);
  return values.length > 0 ? [...values].sort().join(" / ") : null;
}

export function soundEventStartTime(soundEventAnnotation: SoundEventAnnotation): number {
  const coordinates = soundEventAnnotation.geometry.coordinates as unknown;
  if (typeof coordinates === "number") return coordinates;
  if (Array.isArray(coordinates) && typeof coordinates[0] === "number") return coordinates[0];
  return 0;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * The task's calls grouped by species and call type, with the median, min
 * and max main frequency of each group. A sound event with several species
 * (or types) forms its own group ("A / B"). Groups without a species come last.
 */
export function groupMainFrequencies(
  soundEventAnnotations: SoundEventAnnotation[],
  frequencies: ReadonlyMap<number, number | null>,
): MainFrequencyGroup[] {
  const groups = new Map<string, MainFrequencyGroup>();
  for (const soundEventAnnotation of soundEventAnnotations) {
    const species = tagValues(soundEventAnnotation, SPECIES_TAG_KEY);
    const type = tagValues(soundEventAnnotation, CALL_TYPE_TAG_KEY);
    const key = JSON.stringify([species, type]);
    let group = groups.get(key);
    if (group == null) {
      group = { key, species, type, calls: [], median: null, min: null, max: null };
      groups.set(key, group);
    }
    group.calls.push({
      soundEventAnnotation,
      frequency: frequencies.get(soundEventAnnotation.id) ?? null,
    });
  }

  for (const group of Array.from(groups.values())) {
    group.calls.sort(
      (a, b) => soundEventStartTime(a.soundEventAnnotation) - soundEventStartTime(b.soundEventAnnotation),
    );
    const measured = group.calls.map((call) => call.frequency).filter((f): f is number => f != null);
    group.median = median(measured);
    group.min = measured.length > 0 ? Math.min(...measured) : null;
    group.max = measured.length > 0 ? Math.max(...measured) : null;
  }

  const compare = (a: string | null, b: string | null) =>
    a === b ? 0 : a == null ? 1 : b == null ? -1 : a.localeCompare(b);
  return Array.from(groups.values()).sort((a, b) => compare(a.species, b.species) || compare(a.type, b.type));
}
