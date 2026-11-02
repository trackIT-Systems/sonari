import { formatDate, formatTime } from "@/components/filters/DateRangeFilter";
import type { FilterDef } from "@/components/filters/FilterMenu";
import type { Filter } from "@/hooks/utils/useFilter";
import type { NumberFilter } from "@/types";

type TagLike = { key: string; value: string; exclude?: boolean };

type ComparisonFilter = NumberFilter & {
  eq?: number;
  ge?: number;
  le?: number;
};

function formatNumberFilter(value: ComparisonFilter) {
  const parts: string[] = [];
  if (value.eq !== undefined) parts.push(`= ${value.eq}`);
  if (value.gt !== undefined) parts.push(`> ${value.gt}`);
  if (value.ge !== undefined) parts.push(`>= ${value.ge}`);
  if (value.lt !== undefined) parts.push(`< ${value.lt}`);
  if (value.le !== undefined) parts.push(`<= ${value.le}`);
  return parts.join(", ");
}

function formatFilterValue(field: string, value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (field === "sound_event_annotation_tag") {
    const tags = (Array.isArray(value) ? value : [value]) as TagLike[];
    if (tags.length === 0) return null;
    return tags
      .map((tag) =>
        `${tag.exclude ? "Exclude" : "Include"} ${tag.key}: ${tag.value}`,
      )
      .join(", ");
  }

  if (field === "date_range") {
    const ranges = Array.isArray(value) ? value : [value];
    const formatted = ranges
      .map((range) => {
        if (range == null || typeof range !== "object") return null;
        const r = range as {
          start_date?: string;
          start_time?: string;
          end_date?: string;
          end_time?: string;
        };
        return `${formatDate(r.start_date)} ${formatTime(r.start_time)} – ${formatDate(r.end_date)} ${formatTime(r.end_time)}`;
      })
      .filter(Boolean);
    return formatted.length > 0 ? formatted.join("; ") : null;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    if (value[0] != null && typeof value[0] === "object" && "name" in value[0]) {
      return value.map((item) => String((item as { name: string }).name)).join(", ");
    }
    return `${value.length} selected`;
  }

  if (typeof value === "object") {
    if ("name" in value && (value as { name?: string }).name) {
      return String((value as { name: string }).name);
    }
    const asNumber = value as ComparisonFilter;
    if (
      asNumber.eq !== undefined ||
      asNumber.gt !== undefined ||
      asNumber.lt !== undefined ||
      asNumber.ge !== undefined ||
      asNumber.le !== undefined
    ) {
      const formatted = formatNumberFilter(asNumber);
      return formatted.length > 0 ? formatted : null;
    }
    const hasContent = Object.values(value).some((v) => v != null && v !== "");
    return hasContent ? "Set" : null;
  }

  return String(value);
}

/** Human-readable lines for each active (non-fixed) filter. */
export function formatActiveFilterSummary<T extends Object>(
  filter: Filter<T>,
  filterDef: FilterDef<T>[],
): string[] {
  const defByField = new Map(
    filterDef.map((def) => [def.field as string, def]),
  );
  const lines: string[] = [];

  for (const [key, value] of Object.entries(filter.filter)) {
    const field = key as keyof T;
    if (filter.isFixed(field)) {
      continue;
    }
    const def = defByField.get(key);
    if (def == null) {
      continue;
    }
    const formatted = formatFilterValue(key, value);
    if (formatted == null) {
      continue;
    }
    lines.push(`${def.name}: ${formatted}`);
  }

  return lines;
}

export function joinFilterSummary(lines: string[], separator = " · ") {
  return lines.join(separator);
}
