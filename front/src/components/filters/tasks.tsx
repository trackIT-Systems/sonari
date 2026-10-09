import { useState } from "react";

import FilterBadge, { NumberEqFilterBadge, NumberFilterBadge } from "@/components/filters/FilterBadge";
import Button from "@/components/Button";
import { type FilterDef } from "@/components/filters/FilterMenu";
import {
  BooleanFilter,
  IncludeTagMatchFilter,
  type IntegerCountFilter,
  FloatFilter,
  FloatEqFilterFn,
  IntegerFilter,
  TextFilter,
} from "@/components/filters/Filters";
import {
  DateIcon,
  EditIcon,
  NeedsReviewIcon,
  TagIcon,
  VerifiedIcon,
  CompleteIcon,
  HelpIcon,
  SunIcon,
  MoonIcon,
  FilterIcon,
  SpectrogramIcon,
  SearchIcon,
} from "@/components/icons";

import type { AnnotationTaskFilter } from "@/api/annotation_tasks";
import type { Filter } from "@/hooks/utils/useFilter";
import type { Tag } from "@/types";
import TagSearchBar from "@/components/tags/TagSearchBar";
import { DateRangeFilter, formatDate, formatTime } from "./DateRangeFilter";

type TaskFilterTag = Tag & { exclude?: boolean };

function soundEventTagEntryKey(tag: TaskFilterTag) {
  return `${tag.key}:${tag.value}:${tag.exclude ? "exclude" : "include"}`;
}

function formatIntegerCount(value: IntegerCountFilter | undefined) {
  if (value == null) return null;
  const ops: [keyof IntegerCountFilter, string][] = [
    ["eq", "="],
    ["gt", ">"],
    ["ge", ">="],
    ["lt", "<"],
    ["le", "<="],
  ];
  const parts = ops
    .filter(([op]) => value[op] !== undefined)
    .map(([op, label]) => `${label} ${value[op]}`);
  return parts.length > 0 ? parts.join(", ") : null;
}

function SoundEventAnnotationTagSelector({
  filter,
  close,
}: {
  filter: Filter<AnnotationTaskFilter>;
  close: () => void;
}) {
  const [includeMode, setIncludeMode] = useState(true);
  // Remount the search bar after each pick so the input is cleared and refocused.
  const [searchKey, setSearchKey] = useState(0);
  const includeMatch =
    filter.get("sound_event_annotation_tag_include_match") ?? "or";
  const confidence = filter.get("confidence");
  const hasConfidence =
    confidence?.gt !== undefined || confidence?.lt !== undefined;

  const currentValue = filter.get("sound_event_annotation_tag");
  const selectedTags: TaskFilterTag[] =
    currentValue === undefined
      ? []
      : Array.isArray(currentValue)
        ? currentValue
        : [currentValue];
  const tagCount = formatIntegerCount(
    filter.get("sound_event_annotation_tag_count"),
  );
  const soundEventCount = formatIntegerCount(
    filter.get("sound_event_annotation_count"),
  );

  const isSameEntry = (a: TaskFilterTag, b: TaskFilterTag) =>
    a.key === b.key && a.value === b.value && !!a.exclude === !!b.exclude;

  const addTag = (tag: Tag) => {
    const entry: TaskFilterTag = {
      ...tag,
      exclude: includeMode ? undefined : true,
    };
    setSearchKey((k) => k + 1);
    if (selectedTags.some((t) => isSameEntry(t, entry))) {
      return;
    }
    filter.set("sound_event_annotation_tag", [...selectedTags, entry]);
  };

  const removeTag = (tag: TaskFilterTag) => {
    const newValue = selectedTags.filter((t) => !isSameEntry(t, tag));
    if (newValue.length === 0) {
      filter.clear("sound_event_annotation_tag");
    } else {
      filter.set("sound_event_annotation_tag", newValue);
    }
  };

  return (
    <div className="flex flex-col gap-2 w-full">
      <BooleanFilter
        value={includeMode}
        onChange={(include) => setIncludeMode(include)}
      />
      {includeMode ? (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-stone-500 dark:text-stone-400 text-center">
            Combine included tags with
          </span>
          <IncludeTagMatchFilter
            value={includeMatch}
            onChange={(match) =>
              filter.set("sound_event_annotation_tag_include_match", match)
            }
          />
        </div>
      ) : null}
      {hasConfidence ? (
        <p className="text-xs text-stone-500 dark:text-stone-400">
          Confidence is evaluated on the same sound event as each included or
          excluded tag.
        </p>
      ) : null}
      <TagSearchBar
        key={searchKey}
        onSelect={addTag}
        canCreate={false}
        excludeTags={selectedTags.filter(
          (t) => !!t.exclude === !includeMode,
        )}
        placeholder={includeMode ? "Add tag to include..." : "Add tag to exclude..."}
      />
      {selectedTags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {selectedTags.map((tag) => (
            <FilterBadge
              key={soundEventTagEntryKey(tag)}
              field={tag.exclude ? "Exclude" : "Include"}
              value={`${tag.key}: ${tag.value}`}
              onRemove={() => removeTag(tag)}
            />
          ))}
        </div>
      ) : (
        <p className="text-xs text-stone-500 dark:text-stone-400">
          No tags selected yet. Pick as many as you need.
        </p>
      )}
      <div className="flex flex-col gap-1">
        <span className="text-xs text-stone-500 dark:text-stone-400 text-center">
          Distinct tags on task (optional)
        </span>
        <IntegerFilter
          name="Amount"
          onChange={(val) => {
            filter.set("sound_event_annotation_tag_count", val);
          }}
        />
        {tagCount != null ? (
          <div>
            <FilterBadge
              field="Distinct tags"
              value={tagCount}
              onRemove={() => filter.clear("sound_event_annotation_tag_count")}
            />
          </div>
        ) : null}
        <p className="text-xs text-stone-500 dark:text-stone-400">
          Number of different tags on the task. With one included tag, amount
          2 means that tag is present and the task has exactly two distinct
          tags in total.
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-stone-500 dark:text-stone-400 text-center">
          Sound events on task (optional)
        </span>
        <IntegerFilter
          name="Amount"
          onChange={(val) => {
            filter.set("sound_event_annotation_count", val);
          }}
        />
        {soundEventCount != null ? (
          <div>
            <FilterBadge
              field="Sound events"
              value={soundEventCount}
              onRemove={() => filter.clear("sound_event_annotation_count")}
            />
          </div>
        ) : null}
        <p className="text-xs text-stone-500 dark:text-stone-400">
          Number of sound event annotations. With included tags, only events
          carrying those tags are counted (OR/AND applies per event).
        </p>
      </div>
      <div className="flex justify-end">
        <Button mode="filled" variant="primary" onClick={close}>
          Done
        </Button>
      </div>
    </div>
  );
}

const tasksFilterDefs: FilterDef<AnnotationTaskFilter>[] = [
  {
    field: "pending",
    name: "Pending",
    render: ({ value, clear }) => (
      <FilterBadge
        field="Pending"
        value={value ? "Yes" : "No"}
        onRemove={clear}
      />
    ),
    selector: ({ setFilter }) => (
      <BooleanFilter onChange={(val) => setFilter("pending", val)} />
    ),
    description: "Include or exclude pending tasks?",
    icon: (
      <EditIcon className="h-5 w-5 inline-block text-stone-500 mr-1 align-middle" />
    ),
  },
  {
    field: "completed",
    name: "Accepted",
    render: ({ value, clear }) => (
      <FilterBadge
        field="Accepted"
        value={value ? "Yes" : "No"}
        onRemove={clear}
      />
    ),
    selector: ({ setFilter }) => (
      <BooleanFilter onChange={(val) => setFilter("completed", val)} />
    ),
    description: "Include or exclude accepted tasks?",
    icon: (
      <CompleteIcon className="h-5 w-5 inline-block text-stone-500 mr-1 align-middle" />
    ),
  },
  {
    field: "verified",
    name: "Verified",
    render: ({ value, clear }) => (
      <FilterBadge
        field="Verified"
        value={value ? "Yes" : "No"}
        onRemove={clear}
      />
    ),
    selector: ({ setFilter }) => (
      <BooleanFilter onChange={(val) => setFilter("verified", val)} />
    ),
    description: "Include or exclude verified tasks?",
    icon: (
      <VerifiedIcon className="h-5 w-5 inline-block text-stone-500 mr-1 align-middle" />
    ),
  },
  {
    field: "rejected",
    name: "Reject",
    render: ({ value, clear }) => (
      <FilterBadge
        field="Reject"
        value={value ? "Yes" : "No"}
        onRemove={clear}
      />
    ),
    selector: ({ setFilter }) => (
      <BooleanFilter onChange={(val) => setFilter("rejected", val)} />
    ),
    description: "Include or exclude rejected tasks?",
    icon: (
      <NeedsReviewIcon className="h-5 w-5 inline-block text-stone-500 mr-1 align-middle" />
    ),
  },
  {
    name: "Unsure",
    field: "assigned",
    selector: ({ setFilter }) => (
      <BooleanFilter onChange={(val) => setFilter("assigned", val)} />
    ),
    render: ({ value, clear }) => (
      <FilterBadge
          field="Unsure"
          value={value ? "Yes" : "No"}
          onRemove={clear} />
    ),
    description: "Include or exclude tasks marked as unsure?",
    icon: (
      <HelpIcon className="h-5 w-5 inline-block text-stone-500 mr-1 align-middle" />
    ),
  },
  {
    field: "sound_event_annotation_tag",
    name: "Tag",
    render: ({ value, clear, setFilter }) => {
      const tags = (Array.isArray(value) ? value : [value]) as TaskFilterTag[];
      return tags.map((tag) => (
        <FilterBadge
          key={soundEventTagEntryKey(tag)}
          field="Tag"
          operation={tag.exclude ? "Exclude" : "Include"}
          value={`${tag.key}: ${tag.value}`}
          onRemove={() => {
            if (Array.isArray(value)) {
              const newValue = value.filter(
                (t) =>
                  !(
                    t.key === tag.key &&
                    t.value === tag.value &&
                    !!t.exclude === !!tag.exclude
                  ),
              );
              if (newValue.length === 0) {
                clear();
              } else {
                setFilter("sound_event_annotation_tag", newValue);
              }
            } else {
              clear();
            }
          }}
        />
      ));
    },
    selector: ({ filter, close }) => (
      <SoundEventAnnotationTagSelector filter={filter} close={close} />
    ),
    description: (filter) => {
      const confidence = filter.get("confidence");
      const hasConfidence =
        confidence?.gt !== undefined || confidence?.lt !== undefined;
      const confidenceNote = hasConfidence
        ? " With a confidence range, each included tag must appear on a sound event in that range; excluded tags use the same correlation."
        : "";
      const match =
        filter.get("sound_event_annotation_tag_include_match") ?? "or";
      const includeCombine =
        match === "and"
          ? "Included tags: task must have all listed tags."
          : "Included tags: task must have any listed tag.";
      const distinctTagAmount = filter.get("sound_event_annotation_tag_count");
      const distinctTagNote =
        distinctTagAmount?.eq !== undefined
          ? ` Distinct tag amount = ${distinctTagAmount.eq}.`
          : "";
      const soundEventAmount = filter.get("sound_event_annotation_count");
      const soundEventNote =
        soundEventAmount?.eq !== undefined
          ? ` Sound event amount = ${soundEventAmount.eq}.`
          : "";
      return `${includeCombine} Exclude tags: hide tasks that have any listed tag.${distinctTagNote}${soundEventNote}${confidenceNote}`;
    },
    icon: (
      <TagIcon className="h-5 w-5 inline-block text-stone-500 mr-1 align-middle" />
    ),
  },
  {
    field: "sound_event_annotation_tag_count",
    name: "Distinct tag amount",
    hideInMenu: true,
    selector: () => null,
    render: ({ value, clear, setFilter }) => {
      const removeKey = (key: keyof NonNullable<typeof value>) => {
        const newValue = { ...value };
        delete newValue[key];
        if (Object.keys(newValue).length === 0) {
          clear();
        } else {
          setFilter("sound_event_annotation_tag_count", newValue);
        }
      };
      return (
        <>
          {value?.eq !== undefined && (
            <FilterBadge
              field="Distinct tags"
              operation="="
              value={value.eq}
              onRemove={() => removeKey("eq")}
            />
          )}
          {value?.gt !== undefined && (
            <NumberFilterBadge
              field="Distinct tags"
              value={{ gt: value.gt }}
              onRemove={() => removeKey("gt")}
            />
          )}
          {value?.ge !== undefined && (
            <FilterBadge
              field="Distinct tags"
              operation=">="
              value={value.ge}
              onRemove={() => removeKey("ge")}
            />
          )}
          {value?.lt !== undefined && (
            <NumberFilterBadge
              field="Distinct tags"
              value={{ lt: value.lt }}
              onRemove={() => removeKey("lt")}
            />
          )}
          {value?.le !== undefined && (
            <FilterBadge
              field="Distinct tags"
              operation="<="
              value={value.le}
              onRemove={() => removeKey("le")}
            />
          )}
        </>
      );
    },
    description:
      "Number of different tags on the task (set in the Tag filter panel).",
    icon: (
      <TagIcon className="h-5 w-5 inline-block text-stone-500 mr-1 align-middle" />
    ),
  },
  {
    field: "sound_event_annotation_count",
    name: "Sound event amount",
    hideInMenu: true,
    selector: () => null,
    render: ({ value, clear, setFilter }) => {
      const removeKey = (key: keyof NonNullable<typeof value>) => {
        const newValue = { ...value };
        delete newValue[key];
        if (Object.keys(newValue).length === 0) {
          clear();
        } else {
          setFilter("sound_event_annotation_count", newValue);
        }
      };
      return (
        <>
          {value?.eq !== undefined && (
            <FilterBadge
              field="Sound events"
              operation="="
              value={value.eq}
              onRemove={() => removeKey("eq")}
            />
          )}
          {value?.gt !== undefined && (
            <NumberFilterBadge
              field="Sound events"
              value={{ gt: value.gt }}
              onRemove={() => removeKey("gt")}
            />
          )}
          {value?.ge !== undefined && (
            <FilterBadge
              field="Sound events"
              operation=">="
              value={value.ge}
              onRemove={() => removeKey("ge")}
            />
          )}
          {value?.lt !== undefined && (
            <NumberFilterBadge
              field="Sound events"
              value={{ lt: value.lt }}
              onRemove={() => removeKey("lt")}
            />
          )}
          {value?.le !== undefined && (
            <FilterBadge
              field="Sound events"
              operation="<="
              value={value.le}
              onRemove={() => removeKey("le")}
            />
          )}
        </>
      );
    },
    description:
      "Number of sound event annotations on the task (set in the Tag filter panel).",
    icon: (
      <TagIcon className="h-5 w-5 inline-block text-stone-500 mr-1 align-middle" />
    ),
  },
  {
    field: "empty",
    name: "Empty",
    render: ({ value, clear }) => (
      <FilterBadge
        field="Empty"
        value={value ? "Yes" : "No"}
        onRemove={clear}
      />
    ),
    selector: ({ setFilter }) => (
      <BooleanFilter onChange={(val) => setFilter("empty", val)} />
    ),
    description: "Include or exclude tasks without any sound events?",
    icon: (
      <EditIcon className="h-5 w-5 inline-block text-stone-500 mr-1 align-middle" />
    ),
  },
  {
    field: "date_range",
    name: "Date and Time",
    render: ({ value, clear, setFilter }) => {
      const dateRanges = Array.isArray(value) ? value : [value];
      return dateRanges.map((dateRange, index) => (
        <FilterBadge
          key={index}
          field="Date and Time Range"
          value={`${formatDate(dateRange.start_date)} ${formatTime(dateRange.start_time)} - ${formatDate(dateRange.end_date)} ${formatTime(dateRange.end_time)}`}
          onRemove={() => {
            if (Array.isArray(value)) {
              const newValue = value.filter((_, i) => i !== index);
              if (newValue.length === 0) {
                clear();
              } else {
                setFilter("date_range", newValue);
              }
            } else {
              clear();
            }
          }}
        />
      ));
    },
    selector: ({ setFilter, filter }) => (
      <DateRangeFilter
        onChange={(dateRange) => {
          const currentValue = filter.get("date_range");
          if (currentValue === undefined) {
            setFilter("date_range", [dateRange]);
          } else {
            const newValue = Array.isArray(currentValue)
              ? [...currentValue, dateRange]
              : [currentValue, dateRange];
            setFilter("date_range", newValue);
          }
        }}
      />
    ),
    description: "Only show tasks within specific date and time ranges. You can filter for multiple date and time ranges. A task containing either of the ranges will be shown.",
    icon: (
      <DateIcon className="h-5 w-5 inline-block text-stone-500 mr-1 align-middle" />
    ),
  },
  {
    field: "night",
    name: "Night",
    render: ({ value, clear }) => (
      <FilterBadge
      field="Night Filter"
      value={""}
        onRemove={clear}
      />
    ),
    selector: ({ setFilter }) => (
      <Button
        mode="text"
        variant="info"
        onClick={() =>
          setFilter(
            "night",
            { eq: true, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
          )
        }
      >
        Apply
      </Button>
    ),
    description: "Only show tasks during night time.",
    icon: (
      <MoonIcon className="h-5 w-5 inline-block text-stone-500 mr-1 align-middle" />
    ),
  },
  {
    field: "day",
    name: "Day",
    render: ({ value, clear }) => (
      <FilterBadge
        field="Day Filter"
        value={""}
        onRemove={clear}
      />
    ),
    selector: ({ setFilter }) => (
      <Button
        mode="text"
        variant="info"
        onClick={() =>
          setFilter(
            "day",
            { eq: true, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
          )
        }
      >
        Apply
      </Button>
    ),
    description: "Only show tasks during day time.",
    icon: (
      <SunIcon className="h-5 w-5 inline-block text-stone-500 mr-1 align-middle" />
    ),
  },
  {
    field: "sample",
    name: "Sample",
    render: ({ value, clear }) => (
      <NumberEqFilterBadge field="Sample" value={value} onRemove={clear} />
    ),
    selector: ({ setFilter }) => (
      <FloatEqFilterFn name="Sample as fraction" onChange={(val) => setFilter("sample", val)} />
    ),
    description: "Subsample the task in this project. Subsampling always happens after all other filters.",
    icon: (
      <FilterIcon className="h-5 w-5 inline-block text-stone-500 mr-1 align-middle" />
    ),
  },
  {
    name: "Confidence",
    field: "confidence",
    selector: ({ setFilter, filter }) => {
      const tags = filter.get("sound_event_annotation_tag");
      const hasTags =
        tags !== undefined &&
        (Array.isArray(tags) ? tags.length > 0 : true);
      return (
        <div className="flex flex-col gap-2 w-full">
          {hasTags ? (
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Applies to sound events with the selected tags only.
            </p>
          ) : null}
          <FloatFilter
            name="confidence"
            showDecimals={true}
            min={0}
            max={1}
            step={0.01}
            onChange={(val) => {
              const currentValue = filter.get("confidence") || {};
              if ("gt" in val) {
                const newValue = {
                  ...currentValue,
                  gt: val.gt,
                };
                setFilter("confidence", newValue);
              } else if ("lt" in val) {
                const newValue = {
                  ...currentValue,
                  lt: val.lt,
                };
                setFilter("confidence", newValue);
              }
            }}
          />
        </div>
      );
    },
    render: ({ value, clear, setFilter }) => (
      <>
        {value?.gt !== undefined && (
          <NumberFilterBadge
            field="Confidence"
            value={{ gt: value.gt }}
            onRemove={() => {
              const newValue = { ...value };
              delete newValue.gt;
              Object.keys(newValue).length === 0 ? clear() : setFilter("confidence", newValue);
            }}
          />
        )}
        {value?.lt !== undefined && (
          <NumberFilterBadge
            field="Confidence"
            value={{ lt: value.lt }}
            onRemove={() => {
              const newValue = { ...value };
              delete newValue.lt;
              Object.keys(newValue).length === 0 ? clear() : setFilter("confidence", newValue);
            }}
          />
        )}
      </>
    ),
    description: (filter) => {
      const tags = filter.get("sound_event_annotation_tag");
      const hasTags =
        tags !== undefined &&
        (Array.isArray(tags) ? tags.length > 0 : true);
      if (hasTags) {
        return "Filter by detection confidence on sound events with the selected tags. With multiple tags, every selected tag must have an event in this range.";
      }
      return "Filter by detection confidence on any sound event in the task. You can set both a minimum and maximum confidence threshold.";
    },
    icon: (
      <SpectrogramIcon className="h-5 w-5 inline-block text-stone-500 mr-1 align-middle" />
    ),
  },
  {
    name: "Median Confidence",
    field: "median_confidence",
    selector: ({ setFilter, filter }) => {
      const tags = filter.get("sound_event_annotation_tag");
      const hasTags =
        tags !== undefined &&
        (Array.isArray(tags) ? tags.length > 0 : true);
      return (
        <div className="flex flex-col gap-2 w-full">
          {hasTags ? (
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Median is taken per selected tag, over that tag's sound events in the task.
            </p>
          ) : null}
          <FloatFilter
            name="median_confidence"
            showDecimals={true}
            min={0}
            max={1}
            step={0.01}
            onChange={(val) => {
              const currentValue = filter.get("median_confidence") || {};
              if ("gt" in val) {
                const newValue = {
                  ...currentValue,
                  gt: val.gt,
                };
                setFilter("median_confidence", newValue);
              } else if ("lt" in val) {
                const newValue = {
                  ...currentValue,
                  lt: val.lt,
                };
                setFilter("median_confidence", newValue);
              }
            }}
          />
        </div>
      );
    },
    render: ({ value, clear, setFilter }) => (
      <>
        {value?.gt !== undefined && (
          <NumberFilterBadge
            field="Median confidence"
            value={{ gt: value.gt }}
            onRemove={() => {
              const newValue = { ...value };
              delete newValue.gt;
              Object.keys(newValue).length === 0 ? clear() : setFilter("median_confidence", newValue);
            }}
          />
        )}
        {value?.lt !== undefined && (
          <NumberFilterBadge
            field="Median confidence"
            value={{ lt: value.lt }}
            onRemove={() => {
              const newValue = { ...value };
              delete newValue.lt;
              Object.keys(newValue).length === 0 ? clear() : setFilter("median_confidence", newValue);
            }}
          />
        )}
      </>
    ),
    description: (filter) => {
      const tags = filter.get("sound_event_annotation_tag");
      const hasTags =
        tags !== undefined &&
        (Array.isArray(tags) ? tags.length > 0 : true);
      if (hasTags) {
        return "Filter by the median confidence of each selected tag's sound events in the task. With multiple tags, every selected tag must be in this range.";
      }
      return "Filter by the median confidence of all sound events in the task. You can set both a minimum and maximum.";
    },
    icon: (
      <SpectrogramIcon className="h-5 w-5 inline-block text-stone-500 mr-1 align-middle" />
    ),
  },
  // {
  //   name: "Species Confidence",
  //   field: "species_confidence",
  //   selector: ({ setFilter, filter }) => (
  //     <FloatFilter
  //       name="confidence"
  //       showDecimals={true}
  //       min={0}
  //       max={1}
  //       step={0.01}
  //       onChange={(val) => {
  //         const currentValue = filter.get("species_confidence") || {};
  //         if ('gt' in val) {
  //           const newValue = {
  //             ...currentValue,
  //             gt: val.gt
  //           };
  //           setFilter("species_confidence", newValue);
  //         } else if ('lt' in val) {
  //           const newValue = {
  //             ...currentValue,
  //             lt: val.lt
  //           };
  //           setFilter("species_confidence", newValue);
  //         }
  //       }}
  //     />
  //   ),
  //   render: ({ value, clear, setFilter }) => (
  //     <>
  //       {value?.gt !== undefined && (
  //         <NumberFilterBadge
  //           field="Species Confidence"
  //           value={{ gt: value.gt }}
  //           onRemove={() => {
  //             const newValue = { ...value };
  //             delete newValue.gt;
  //             Object.keys(newValue).length === 0 ? clear() : setFilter("species_confidence", newValue);
  //           }}
  //         />
  //       )}
  //       {value?.lt !== undefined && (
  //         <NumberFilterBadge
  //           field="Species Confidence"
  //           value={{ lt: value.lt }}
  //           onRemove={() => {
  //             const newValue = { ...value };
  //             delete newValue.lt;
  //             Object.keys(newValue).length === 0 ? clear() : setFilter("species_confidence", newValue);
  //           }}
  //         />
  //       )}
  //     </>
  //   ),
  //   description: "Filter by species confidence. You can set both a minimum and maximum confidence threshold.",
  //   icon: (
  //     <SpectrogramIcon className="h-5 w-5 inline-block text-stone-500 mr-1 align-middle" />
  //   ),
  // },
  {
    name: "Min Frequency",
    field: "sound_event_annotation_min_frequency",
    selector: ({ setFilter, filter }) => (
      <FloatFilter
        name="frequency (Hz)"
        showDecimals={false}
        onChange={(val) => {
          const currentValue = filter.get("sound_event_annotation_min_frequency") || {};
          if ('gt' in val) {
            const newValue = {
              ...currentValue,
              gt: val.gt
            };
            setFilter("sound_event_annotation_min_frequency", newValue);
          } else if ('lt' in val) {
            const newValue = {
              ...currentValue,
              lt: val.lt
            };
            setFilter("sound_event_annotation_min_frequency", newValue);
          }
        }}
      />
    ),
    render: ({ value, clear, setFilter }) => (
      <>
        {value?.gt !== undefined && (
          <NumberFilterBadge
            field="Min Frequency"
            value={{ gt: value.gt }}
            onRemove={() => {
              const newValue = { ...value };
              delete newValue.gt;
              Object.keys(newValue).length === 0 ? clear() : setFilter("sound_event_annotation_min_frequency", newValue);
            }}
          />
        )}
        {value?.lt !== undefined && (
          <NumberFilterBadge
            field="Min Frequency"
            value={{ lt: value.lt }}
            onRemove={() => {
              const newValue = { ...value };
              delete newValue.lt;
              Object.keys(newValue).length === 0 ? clear() : setFilter("sound_event_annotation_min_frequency", newValue);
            }}
          />
        )}
      </>
    ),
    description: "Filter by the minimum frequency of sound events. Only show tasks containing sound events with a minimum frequency within the specified range.",
    icon: (
      <SpectrogramIcon className="h-5 w-5 inline-block text-stone-500 mr-1 align-middle" />
    ),
  },
  {
    name: "Max Frequency",
    field: "sound_event_annotation_max_frequency",
    selector: ({ setFilter, filter }) => (
      <FloatFilter
        name="frequency (Hz)"
        showDecimals={false}
        onChange={(val) => {
          const currentValue = filter.get("sound_event_annotation_max_frequency") || {};
          if ('gt' in val) {
            const newValue = {
              ...currentValue,
              gt: val.gt
            };
            setFilter("sound_event_annotation_max_frequency", newValue);
          } else if ('lt' in val) {
            const newValue = {
              ...currentValue,
              lt: val.lt
            };
            setFilter("sound_event_annotation_max_frequency", newValue);
          }
        }}
      />
    ),
    render: ({ value, clear, setFilter }) => (
      <>
        {value?.gt !== undefined && (
          <NumberFilterBadge
            field="Max Frequency"
            value={{ gt: value.gt }}
            onRemove={() => {
              const newValue = { ...value };
              delete newValue.gt;
              Object.keys(newValue).length === 0 ? clear() : setFilter("sound_event_annotation_max_frequency", newValue);
            }}
          />
        )}
        {value?.lt !== undefined && (
          <NumberFilterBadge
            field="Max Frequency"
            value={{ lt: value.lt }}
            onRemove={() => {
              const newValue = { ...value };
              delete newValue.lt;
              Object.keys(newValue).length === 0 ? clear() : setFilter("sound_event_annotation_max_frequency", newValue);
            }}
          />
        )}
      </>
    ),
    description: "Filter by the maximum frequency of sound events. Only show tasks containing sound events with a maximum frequency within the specified range.",
    icon: (
      <SpectrogramIcon className="h-5 w-5 inline-block text-stone-500 mr-1 align-middle" />
    ),
  },
  {
    field: "search_recordings",
    name: "Search Recordings",
    render: ({ value, clear }) => (
      <FilterBadge
        field="Search"
        value={value}
        onRemove={clear}
      />
    ),
    selector: ({ setFilter }) => (
      <TextFilter
        name="Recording path"
        placeholder="Search recordings..."
        onChange={(val) => setFilter("search_recordings", val)}
      />
    ),
    description: "Filter tasks by recording file name or path.",
    icon: (
      <SearchIcon className="h-5 w-5 inline-block text-stone-500 mr-1 align-middle" />
    ),
  },
];

export default tasksFilterDefs;
