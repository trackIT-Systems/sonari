import type { AnnotationTaskFilter } from "@/api/annotation_tasks";
import type { SpeciesTag } from "@/components/reference_calls/usePinnedReferenceSpecies";
import type { Filter } from "@/hooks/utils/useFilter";

type TagLike = SpeciesTag & { exclude?: boolean };

/** The single sound event tag the task list is filtered to include, if there is exactly one. */
export function includedSpecies(filter: Filter<AnnotationTaskFilter>): SpeciesTag | undefined {
  const value = filter.get("sound_event_annotation_tag") as TagLike | TagLike[] | undefined;
  const included = (value === undefined ? [] : Array.isArray(value) ? value : [value]).filter((t) => !t.exclude);
  return included.length === 1 ? { key: included[0].key, value: included[0].value } : undefined;
}
