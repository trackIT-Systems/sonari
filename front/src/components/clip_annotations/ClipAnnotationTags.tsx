import { useMemo } from "react";

import Button from "@/components/Button";
import Card from "@/components/Card";
import Empty from "@/components/Empty";
import { H4 } from "@/components/Headings";
import { DeleteIcon, TagsIcon } from "@/components/icons";
import AddTagButton from "@/components/tags/AddTagButton";
import TagComponent from "@/components/tags/Tag";
import useStore from "@/store";

import type { TagFilter } from "@/api/tags";
import type { ClipAnnotation, Tag } from "@/types";

function NoTags() {
  return (
    <Empty padding="p-2">No sound event tags in this clip.</Empty>
  );
}

type TagCount = {
  tag: Tag;
  count: number;
}

export default function ClipAnnotationTags({
  clipAnnotation,
  tagFilter,
  onAddTag,
  onRemoveTag,
  onClickTag,
  onClearTags,
  onCreateTag,
  disabled = false,
}: {
  clipAnnotation?: ClipAnnotation;
  tagFilter?: TagFilter;
  onAddTag?: (tag: Tag) => void;
  onClickTag?: (tag: Tag) => void;
  onRemoveTag?: (tag: Tag) => void;
  onCreateTag?: (tag: Tag) => void;
  onClearTags?: () => void;
  disabled?: boolean;
}) {
  const tagsWithCount = useMemo(() => {
    if (!clipAnnotation?.sound_events) return [];
    
    // Get all tags from sound events
    const allTags = clipAnnotation.sound_events.flatMap(event => event.tags || []);
    
    // Count occurrences of each unique tag
    const tagCounts = new Map<string, TagCount>();
    
    allTags.forEach(tag => {
      const key = `${tag.key}-${tag.value}`;
      const existing = tagCounts.get(key);
      if (existing) {
        existing.count++;
      } else {
        tagCounts.set(key, { tag, count: 1 });
      }
    });
    
    return Array.from(tagCounts.values());
  }, [clipAnnotation]);

  const getTagColor = useStore((state) => state.getTagColor);

  return (
    <Card>
      <H4 className="text-center">
        <TagsIcon className="inline-block mr-1 w-5 h-5" />
        Sound Event Tags
      </H4>
      <div className="flex flex-row items-center flex-wrap gap-1">
        {tagsWithCount.map(({ tag, count }) => (
          <TagComponent
            key={`${tag.key}-${tag.value}`}
            tag={tag}
            {...getTagColor(tag)}
            onClick={() => onClickTag?.(tag)}
            onClose={() => onRemoveTag?.(tag)}
            count={count}
          />
        ))}
        {tagsWithCount.length === 0 && <NoTags />}
      </div>
    </Card>
  );
}