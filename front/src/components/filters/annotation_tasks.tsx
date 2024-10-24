import FilterBadge from "@/components/filters/FilterBadge";
import { BooleanFilter, TagFilter, DatasetFilter } from "@/components/filters/Filters";
import { DateIcon, EditIcon, NeedsReviewIcon, VerifiedIcon, TagIcon, DatasetIcon } from "@/components/icons";
import { DateRangeFilter, formatDate, formatTime } from "./DateRangeFilter";

import type { AnnotationTaskFilter } from "@/api/annotation_tasks";
import type { FilterDef } from "@/components/filters/FilterMenu";

// TODO: Create custom filter for integer, date, time, tags and boolean values
const annotationTaskFilterDefs: FilterDef<AnnotationTaskFilter>[] = [
  {
    name: "Verified",
    field: "verified",
    selector: ({ setFilter }) => (
      <BooleanFilter
        onChange={(val) => setFilter("verified", val)}
      />
    ),
    render: ({ value, clear }) => (
      <FilterBadge
          field="Verified"
          value={value ? "Yes" : "No"}
          onRemove={clear} />
    ),
    description: "Select only verified annotation tasks.",
    icon: (
      <VerifiedIcon className="h-5 w-5 inline-block text-stone-500 mr-1 align-middle" />
    ),
  },
  {
    name: "Rejected",
    field: "rejected",
    selector: ({ setFilter }) => (
      <BooleanFilter
        onChange={(val) => setFilter("rejected", val)}
      />
    ),
    render: ({ value, clear }) => (
      <FilterBadge
          field="Rejected"
          value={value ? "Yes" : "No"}
          onRemove={clear} />
    ),
    description: "Select only rejected annotation tasks.",
    icon: (
      <NeedsReviewIcon className="h-5 w-5 inline-block text-stone-500 mr-1 align-middle" />
    ),
  },
  {
    name: "Accepted",
    field: "completed",
    selector: ({ setFilter }) => (
      <BooleanFilter
        onChange={(val) => setFilter("completed", val)}
      />
    ),
    render: ({ value, clear }) => (
      <FilterBadge
          field="Accepted"
          value={value ? "Yes" : "No"}
          onRemove={clear} />
    ),
    description: "Select only accepted annotation tasks.",
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
    name: "Pending",
    field: "pending",
    selector: ({ setFilter }) => (
      <BooleanFilter
        onChange={(val) => setFilter("pending", val)}
      />
    ),
    render: ({ value, clear }) => (
      <FilterBadge
          field="Pending"
          value={value ? "Yes" : "No"}
          onRemove={clear} />
    ),
    description: "Select only pending annotation tasks.",
    icon: (
      <EditIcon className="h-5 w-5 inline-block text-stone-500 mr-1 align-middle" />
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

export default annotationTaskFilterDefs;
