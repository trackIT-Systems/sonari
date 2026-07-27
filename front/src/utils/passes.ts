import type { Geometry, SoundEventAnnotation, Tag } from "@/types";

export const PASS_TAG_KEY = "pass";

export const DEFAULT_TAG_VISIBILITY: TagVisibilityFilter = {
  species: true,
  passes: true,
  type: true,
};

export type TagCategory = "species" | "passes" | "type";

export type TagVisibilityFilter = {
  species: boolean;
  passes: boolean;
  type: boolean;
};

export type PassGroup = {
  passTag: Tag;
  events: SoundEventAnnotation[];
};

export type PassContext = {
  passTag: Tag;
  events: SoundEventAnnotation[];
  index: number;
  total: number;
};

export function isPassTag(tag: Tag): boolean {
  return tag.key === PASS_TAG_KEY;
}

export function classifyTag(tag: Tag): TagCategory {
  if (tag.key === PASS_TAG_KEY) {
    return "passes";
  }
  if (tag.key === "type") {
    return "type";
  }
  return "species";
}

export function isTagVisible(
  tag: Tag,
  visibility: TagVisibilityFilter,
): boolean {
  return visibility[classifyTag(tag)];
}

export function filterTagsByVisibility(
  tags: Tag[],
  visibility: TagVisibilityFilter,
): Tag[] {
  return tags.filter((tag) => isTagVisible(tag, visibility));
}

export function getPassTag(tags: Tag[] | null | undefined): Tag | null {
  return tags?.find(isPassTag) ?? null;
}

export function hasPassTag(tags: Tag[] | null | undefined): boolean {
  return getPassTag(tags) != null;
}

export function formatPassLabel(tag: Tag): string {
  return tag.value;
}

function getPassGroupKey(tag: Tag): string {
  return `${tag.key}-${tag.value}`;
}

function comparePassValues(a: string, b: string): number {
  const aNum = Number(a);
  const bNum = Number(b);
  if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) {
    return aNum - bNum;
  }
  return a.localeCompare(b);
}

function getStartTime(geometry: Geometry): number {
  switch (geometry.type) {
    case "BoundingBox":
      return geometry.coordinates[0];
    case "TimeInterval":
      return geometry.coordinates[0];
    default:
      return 0;
  }
}

function sortByStartTime(
  events: SoundEventAnnotation[],
): SoundEventAnnotation[] {
  return [...events].sort(
    (a, b) => getStartTime(a.geometry) - getStartTime(b.geometry),
  );
}

export function getPassGroups(
  annotations: SoundEventAnnotation[],
): PassGroup[] {
  const groups = new Map<string, PassGroup>();

  for (const annotation of annotations) {
    const passTag = getPassTag(annotation.tags ?? []);
    if (passTag == null) {
      continue;
    }

    const key = getPassGroupKey(passTag);
    const existing = groups.get(key);
    if (existing) {
      existing.events.push(annotation);
    } else {
      groups.set(key, { passTag, events: [annotation] });
    }
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      events: sortByStartTime(group.events),
    }))
    .sort((a, b) =>
      comparePassValues(a.passTag.value, b.passTag.value),
    );
}

export function getPassContext(
  annotation: SoundEventAnnotation,
  annotations: SoundEventAnnotation[],
): PassContext | null {
  const passTag = getPassTag(annotation.tags ?? []);
  if (passTag == null) {
    return null;
  }

  for (const group of getPassGroups(annotations)) {
    const index = group.events.findIndex((event) => event.id === annotation.id);
    if (index >= 0) {
      return {
        passTag: group.passTag,
        events: group.events,
        index,
        total: group.events.length,
      };
    }
  }

  return null;
}

export function getPassSiblingIds(
  annotation: SoundEventAnnotation | null | undefined,
  annotations: SoundEventAnnotation[],
): Set<number> {
  if (annotation == null) {
    return new Set();
  }

  const context = getPassContext(annotation, annotations);
  if (context == null) {
    return new Set();
  }

  return new Set(
    context.events
      .filter((event) => event.id !== annotation.id)
      .map((event) => event.id),
  );
}

export function getPassTimeRange(
  events: SoundEventAnnotation[],
): { start: number; end: number } | null {
  if (events.length === 0) {
    return null;
  }

  let start = Infinity;
  let end = -Infinity;

  for (const event of events) {
    const geometry = event.geometry;
    if (geometry.type === "BoundingBox") {
      start = Math.min(start, geometry.coordinates[0]);
      end = Math.max(end, geometry.coordinates[2]);
    } else if (geometry.type === "TimeInterval") {
      start = Math.min(start, geometry.coordinates[0]);
      end = Math.max(end, geometry.coordinates[1]);
    }
  }

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return null;
  }

  return { start, end };
}
