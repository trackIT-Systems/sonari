import { useMemo } from "react";

import Empty from "@/components/Empty";
import { H4 } from "@/components/Headings";
import { TagsIcon } from "@/components/icons";
import AddTagButton from "@/components/tags/AddTagButton";
import TagComponent, { getTagKey } from "@/components/tags/Tag";

import type { TagFilter } from "@/api/tags";
import type { SoundEventAnnotation, Tag } from "@/types";

function NoTags() {
  return <Empty padding="p-2">No tags</Empty>;
}

export default function SoundEventAnnotationTags({
  soundEventAnnotation,
  tagFilter,
  onClickTag,
  onAddTag,
  onRemoveTag,
}: {
  soundEventAnnotation: SoundEventAnnotation;
  tagFilter?: TagFilter;
  onClickTag?: (tag: Tag) => void;
  onAddTag?: (tag: Tag) => void;
  onRemoveTag?: (tag: Tag) => void;
}) {
  const tags = useMemo(
    () => soundEventAnnotation.tags || [],
    [soundEventAnnotation],
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between items-center gap-2 mb-2">
        <H4 className="text-center whitespace-nowrap">
          <TagsIcon className="inline-block mr-1 w-5 h-5" />
          Sound Event Tags
        </H4>
      </div>
      <div className="flex flex-row items-center flex-wrap gap-1">
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
