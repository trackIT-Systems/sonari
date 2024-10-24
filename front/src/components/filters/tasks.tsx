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
    description: "Select only tasks that are pending",
    icon: (
      <EditIcon className="h-5 w-5 inline-block text-stone-500 mr-1 align-middle" />
    ),
  },
  {
    field: "completed",
    name: "Accepted",
    render: ({ value, clear }) => (
      <FilterBadge
        field="accepted"
        value={value ? "Yes" : "No"}
        onRemove={clear}
      />
    ),
    selector: ({ setFilter }) => (
      <BooleanFilter onChange={(val) => setFilter("completed", val)} />
    ),
    description: "Select only accepted tasks",
    icon: (
      <EditIcon className="h-5 w-5 inline-block text-stone-500 mr-1 align-middle" />
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
    description: "Select only verified tasks",
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
    description: "Select only rejected tasks",
    icon: (
      <NeedsReviewIcon className="h-5 w-5 inline-block text-stone-500 mr-1 align-middle" />
    ),
  },
  {
    name: "Unsure",
    field: "assigned",
    selector: ({ setFilter }) => (
      <BooleanFilter
        onChange={(val) => setFilter("assigned", val)}
      />
    ),
    render: ({ value, clear }) => (
      <FilterBadge
          field="Unsure"
          value={value ? "Yes" : "No"}
          onRemove={clear} />
    ),
    description: "Select only unsure annotation tasks.",
    icon: (
      <NeedsReviewIcon className="h-5 w-5 inline-block text-stone-500 mr-1 align-middle" />
    ),
  },
  {
    field: "sound_event_annotation_tag",
    name: "Sound Event Tag",
    render: ({ value, clear }) => (
      <FilterBadge
        field="Sound Event Tag"
        value={`${value.key}: ${value.value}`}
        onRemove={clear}
      />
    ),
    selector: ({ setFilter }) => (
      <TagFilter onChange={(val) => setFilter("sound_event_annotation_tag", val)} />
    ),
    description: "Select task that contain a sound event with a specific tag",
    icon: (
      <TagIcon className="h-5 w-5 inline-block text-stone-500 mr-1 align-middle" />
    ),
  },
  {
    field: "dataset",
    name: "Dataset",
    render: ({ value, clear }) => (
      <FilterBadge field="Dataset" value={value.name} onRemove={clear} />
    ),
    selector: ({ setFilter }) => (
      <DatasetFilter onChange={(val) => setFilter("dataset", val)} />
    ),
    description: "Select tasks that come from a specific dataset",
    icon: (
      <DatasetIcon className="h-5 w-5 inline-block text-stone-500 mr-1 align-middle" />
    ),
  },
  {
    field: "date_range",
    name: "Date and Time",
    render: ({ value, clear }) => (
      <FilterBadge
        field="Date and Time Range"
        value={`${formatDate(value.start_date)} ${formatTime(value.start_time)} - ${formatDate(value.end_date)} ${formatTime(value.end_time)}`}
        onRemove={clear}
      />
    ),
    selector: ({ setFilter }) => (
      <DateRangeFilter onChange={(val) => setFilter("date_range", val)} />
    ),
    description: "Select tasks within a specific date and time range",
    icon: (
      <DateIcon className="h-5 w-5 inline-block text-stone-500 mr-1 align-middle" />
    ),
  },
];

export default tasksFilterDefs;
