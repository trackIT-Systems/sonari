import { useMemo } from "react";

import Empty from "@/components/Empty";
import { H4 } from "@/components/Headings";
import { TagsIcon } from "@/components/icons";
import AddTagButton from "@/components/tags/AddTagButton";
import TagComponent, { getTagKey } from "@/components/tags/Tag";
import { filterTagsByVisibility } from "@/utils/passes";

import type { TagFilter } from "@/api/tags";
import type { SoundEventAnnotation, Tag } from "@/types";
import type { TagVisibilityFilter } from "@/utils/passes";

function NoTags() {
  return <Empty padding="p-2">No tags</Empty>;
}

export default function SoundEventAnnotationTags({
  soundEventAnnotation,
  tagFilter,
  onClickTag,
  onAddTag,
  onRemoveTag,
  tagVisibility,
}: {
  soundEventAnnotation: SoundEventAnnotation;
  tagFilter?: TagFilter;
  onClickTag?: (tag: Tag) => void;
  onAddTag?: (tag: Tag) => void;
  onRemoveTag?: (tag: Tag) => void;
  tagVisibility?: TagVisibilityFilter;
}) {
  const tags = useMemo(
    () => {
      const annotationTags = soundEventAnnotation.tags || [];
      return tagVisibility
        ? filterTagsByVisibility(annotationTags, tagVisibility)
        : annotationTags;
    },
    [soundEventAnnotation, tagVisibility],
  );

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-2">
      <div className="flex min-w-0 justify-between items-center gap-2 mb-2">
        <H4 className="min-w-0 flex-1 text-center leading-tight">
          <TagsIcon className="inline-block mr-1 w-5 h-5" />
          Sound Event Annotation Tags
        </H4>
      </div>
      <div className="flex min-w-0 flex-row flex-wrap items-center gap-1">
        {tags.map((tag) => (
          <TagComponent
            key={getTagKey(tag)}
            tag={tag}
            onClick={() => onClickTag?.(tag)}
            onClose={onRemoveTag ? () => onRemoveTag(tag) : undefined}
            count={null}
          />
        ))}
        {tags.length === 0 && <NoTags />}
      </div>
      <div className="flex flex-row justify-center gap-4 items-center">
        <AddTagButton
          variant="primary"
          filter={tagFilter}
          text="Add tags"
          placeholder="Add tags..."
          onAdd={onAddTag}
        />
      </div>
    </div>
  );
}
