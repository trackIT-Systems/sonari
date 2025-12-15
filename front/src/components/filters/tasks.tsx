import FilterBadge, { NumberEqFilterBadge, NumberFilterBadge } from "@/components/filters/FilterBadge";
import Button from "@/components/Button";
import { type FilterDef } from "@/components/filters/FilterMenu";
import {
  BooleanFilter,
  DatasetFilter,
  TagFilter,
  FloatFilter,
  FloatEqFilterFn,
  TextFilter,
} from "@/components/filters/Filters";
import {
  DatasetIcon,
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
import { DateRangeFilter, formatDate, formatTime } from "./DateRangeFilter";

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
      const tags = Array.isArray(value) ? value : [value];
      return tags.map(tag => (
        <FilterBadge
          key={`${tag.key}:${tag.value}`}
          field="Tag"
          value={`${tag.key}: ${tag.value}`}
          onRemove={() => {
            if (Array.isArray(value)) {
              const newValue = value.filter(t => 
                !(t.key === tag.key && t.value === tag.value)
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
    selector: ({ setFilter, filter }) => (
      <TagFilter 
        onChange={(tag) => {
          const currentValue = filter.get("sound_event_annotation_tag");
          if (currentValue === undefined) {
            setFilter("sound_event_annotation_tag", [tag]);
          } else {
            const newValue = Array.isArray(currentValue)
              ? [...currentValue, tag]
              : [currentValue, tag];
            setFilter("sound_event_annotation_tag", newValue);
          }
        }} 
      />
    ),
    description: "Only show tasks containing sound events with specific tags. You can filter for multiple tags. A task containing either of the tags will be shown.",
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
    field: "dataset",
    name: "Station",
    render: ({ value, clear, setFilter }) => {
      const datasets = Array.isArray(value) ? value : [value];
      return datasets.map(dataset => (
        <FilterBadge 
          key={dataset.id}
          field="Dataset" 
          value={dataset.name} 
          onRemove={() => {
            if (Array.isArray(value)) {
              const newValue = value.filter(d => d.id !== dataset.id);
              if (newValue.length === 0) {
                clear();
              } else {
                setFilter("dataset", newValue);
              }
            } else {
              clear();
            }
          }} 
        />
      ));
    },
    selector: ({ setFilter, filter }) => (  // Add filter to selector props
      <DatasetFilter 
        onChange={(dataset) => {
          const currentValue = filter.get("dataset");
          if (currentValue === undefined) {
            setFilter("dataset", [dataset]);
          } else {
            const newValue = Array.isArray(currentValue) 
              ? [...currentValue, dataset]
              : [currentValue, dataset];
            setFilter("dataset", newValue);
          }
        }} 
      />
    ),
    description: "Only show tasks from a specific stations. You can filter for multiple stations. A task from either of the stations will be shown.",
    icon: (
      <DatasetIcon className="h-5 w-5 inline-block text-stone-500 mr-1 align-middle" />
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
    name: "Detection Confidence",
    field: "detection_confidence",
    selector: ({ setFilter, filter }) => (
      <FloatFilter
        name="confidence"
        showDecimals={true}
        min={0}
        max={1}
        step={0.01}
        onChange={(val) => {
          const currentValue = filter.get("detection_confidence") || {};
          if ('gt' in val) {
            const newValue = {
              ...currentValue,
              gt: val.gt
            };
            setFilter("detection_confidence", newValue);
          } else if ('lt' in val) {
            const newValue = {
              ...currentValue,
              lt: val.lt
            };
            setFilter("detection_confidence", newValue);
          }
        }}
      />
    ),
    render: ({ value, clear, setFilter }) => (
      <>
        {value?.gt !== undefined && (
          <NumberFilterBadge
            field="Detection Confidence"
            value={{ gt: value.gt }}
            onRemove={() => {
              const newValue = { ...value };
              delete newValue.gt;
              Object.keys(newValue).length === 0 ? clear() : setFilter("detection_confidence", newValue);
            }}
          />
        )}
        {value?.lt !== undefined && (
          <NumberFilterBadge
            field="Detection Confidence"
            value={{ lt: value.lt }}
            onRemove={() => {
              const newValue = { ...value };
              delete newValue.lt;
              Object.keys(newValue).length === 0 ? clear() : setFilter("detection_confidence", newValue);
            }}
          />
        )}
      </>
    ),
    description: "Filter by detection confidence. You can set both a minimum and maximum confidence threshold.",
    icon: (
      <SpectrogramIcon className="h-5 w-5 inline-block text-stone-500 mr-1 align-middle" />
    ),
  },
  {
    name: "Species Confidence",
    field: "species_confidence",
    selector: ({ setFilter, filter }) => (
      <FloatFilter
        name="confidence"
        showDecimals={true}
        min={0}
        max={1}
        step={0.01}
        onChange={(val) => {
          const currentValue = filter.get("species_confidence") || {};
          if ('gt' in val) {
            const newValue = {
              ...currentValue,
              gt: val.gt
            };
            setFilter("species_confidence", newValue);
          } else if ('lt' in val) {
            const newValue = {
              ...currentValue,
              lt: val.lt
            };
            setFilter("species_confidence", newValue);
          }
        }}
      />
    ),
    render: ({ value, clear, setFilter }) => (
      <>
        {value?.gt !== undefined && (
          <NumberFilterBadge
            field="Species Confidence"
            value={{ gt: value.gt }}
            onRemove={() => {
              const newValue = { ...value };
              delete newValue.gt;
              Object.keys(newValue).length === 0 ? clear() : setFilter("species_confidence", newValue);
            }}
          />
        )}
        {value?.lt !== undefined && (
          <NumberFilterBadge
            field="Species Confidence"
            value={{ lt: value.lt }}
            onRemove={() => {
              const newValue = { ...value };
              delete newValue.lt;
              Object.keys(newValue).length === 0 ? clear() : setFilter("species_confidence", newValue);
            }}
          />
        )}
      </>
    ),
    description: "Filter by species confidence. You can set both a minimum and maximum confidence threshold.",
    icon: (
      <SpectrogramIcon className="h-5 w-5 inline-block text-stone-500 mr-1 align-middle" />
    ),
  },
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
