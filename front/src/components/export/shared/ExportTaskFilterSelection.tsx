import Card from "@/components/Card";
import { H3 } from "@/components/Headings";
import Button from "@/components/Button";
import FilterPopover from "@/components/filters/FilterMenu";
import FilterBar from "@/components/filters/FilterBar";
import FilterPresets from "@/components/filters/FilterPresets";
import { normalizeDateRangeForPreset } from "@/components/filters/DateRangeFilter";
import tasksFilterDefs from "@/components/filters/tasks";
import { FilterIcon } from "@/components/icons";
import type { AnnotationTaskFilter } from "@/api/annotation_tasks";
import type { Filter } from "@/hooks/utils/useFilter";

interface ExportTaskFilterSelectionProps {
  filter: Filter<AnnotationTaskFilter>;
}

export default function ExportTaskFilterSelection({
  filter,
}: ExportTaskFilterSelectionProps) {
  const activeCount = Object.keys(filter.filter).filter(
    (key) => !filter.isFixed(key as keyof AnnotationTaskFilter),
  ).length;

  return (
    <Card className="overflow-visible">
      <div>
        <H3 className="text-lg">Task filters</H3>
        <p className="text-stone-500">
          Same filters as the annotation task list. All sound events on matching tasks are included in the dump.
        </p>
      </div>
      <div className="space-y-4">
        <div>
          <div className="mb-2 text-stone-700 dark:text-stone-300 underline underline-offset-2 decoration-amber-500 decoration-2">
            Apply filter
          </div>
          <div className="relative z-20 flex flex-wrap items-center gap-2">
            <FilterPopover
              filter={filter}
              filterDef={tasksFilterDefs}
              panelAlign="start"
              button={
                <Button mode="outline" variant="primary">
                  <FilterIcon className="h-4 w-4 stroke-2 mr-2" />
                  Add filter
                </Button>
              }
            />
            <FilterPresets
              storageKey="presets:annotation_tasks"
              filter={filter}
              normalizeForPreset={normalizeDateRangeForPreset}
              panelAlign="start"
            />
          </div>
        </div>
        <div className="relative z-0">
          <label className="block mb-2 font-medium text-stone-600 dark:text-stone-400">
            Active filters
          </label>
          {activeCount === 0 ? (
            <small className="text-stone-500">
              No filters — every task in the selected projects is exported.
            </small>
          ) : (
            <FilterBar filter={filter} filterDef={tasksFilterDefs} />
          )}
        </div>
      </div>
    </Card>
  );
}
