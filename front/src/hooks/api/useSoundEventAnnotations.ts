import { type SoundEventAnnotationFilter } from "@/api/sound_event_annotations";
import api from "@/app/api";
import useFilter from "@/hooks/utils/useFilter";
import usePagedQuery from "@/hooks/utils/usePagedQuery";

const _empty: SoundEventAnnotationFilter = {};
const _fixed: (keyof SoundEventAnnotationFilter)[] = [];

export default function useSoundEventAnnotations({
  filter: initialFilter = _empty,
  fixed = _fixed,
  pageSize = 100,
}: {
  filter?: SoundEventAnnotationFilter;
  fixed?: (keyof SoundEventAnnotationFilter)[];
  pageSize?: number;
} = {}) {
  const filter = useFilter<SoundEventAnnotationFilter>({
    defaults: initialFilter,
    fixed,
    persistKey: "filters:sound_event_annotations",
  });

  const { items, total, pagination, query } = usePagedQuery({
    name: "sound_event_annotations",
    queryFn: api.soundEventAnnotations.getMany,
    pageSize: pageSize,
    filter: filter.filter,
  });

  return {
    ...query,
    items,
    total,
    pagination,
    filter,
  } as const;
}
