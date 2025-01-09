import FilterBadge from "@/components/filters/FilterBadge";
import { type FilterDef } from "@/components/filters/FilterMenu";
import {
  BooleanFilter,
  DatasetFilter,
  TagFilter,
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
} from "@/components/icons";

import type { AnnotationTaskFilter } from "@/api/annotation_tasks";
import { DateRangeFilter, formatDate, formatTime } from "./DateRangeFilter";
import { Tag } from "@/types";

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
    name: "Sound Event Tag",
    render: ({ value, clear, setFilter }) => {
      const tags = Array.isArray(value) ? value : [value];
      return tags.map(tag => (
        <FilterBadge
          key={`${tag.key}:${tag.value}`}
          field="Sound Event Tag"
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
    field: "dataset",
    name: "Dataset",
    render: ({ value, clear, setFilter }) => {
      const datasets = Array.isArray(value) ? value : [value];
      return datasets.map(dataset => (
        <FilterBadge 
          key={dataset.uuid}
          field="Dataset" 
          value={dataset.name} 
          onRemove={() => {
            if (Array.isArray(value)) {
              const newValue = value.filter(d => d.uuid !== dataset.uuid);
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
    description: "Only show tasks from a specific dataset. You can filter for multiple datasets. A task from either of the datasets will be shown.",
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
    selector: ({ setFilter }) => {
      setFilter("night", {eq: true, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone});
      return null;
    },
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
    selector: ({ setFilter }) => {
      setFilter("day", {eq: true, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone});
      return null;
    },
    description: "Only show tasks during day time.",
    icon: (
      <SunIcon className="h-5 w-5 inline-block text-stone-500 mr-1 align-middle" />
    ),
  },
];

export default tasksFilterDefs;
