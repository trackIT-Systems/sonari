import { useMemo } from "react";

import { TagsIcon } from "@/components/icons";
import AddTagButton from "@/components/tags/AddTagButton";
import TagComponent, { getTagKey } from "@/components/tags/Tag";
import useRecording from "@/hooks/api/useRecording";
import { H4 } from "../Headings";

import type { Recording, Tag } from "@/types";
import Card from "../Card";

export default function RecordingTagBar({
  recording: data,
  onAddTag,
  onTagClick,
  onRemoveTag,
  disabled = false,
}: {
  recording: Recording;
  onTagClick?: (tag: Tag) => void;
  onAddTag?: (data: Recording) => void;
  onRemoveTag?: (data: Recording) => void;
  disabled?: boolean;
}) {
  const {
    data: { tags } = {},
    addTag: { mutate: addTag },
    removeTag: { mutate: removeTag },
  } = useRecording({
    uuid: data.uuid,
    recording: data,
    onAddTag,
    onRemoveTag,
  });

  const { handleAddTag, handleRemoveTag } = useMemo(() => {
    if (disabled) {
      return {};
    }
    return {
      handleAddTag: addTag,
      handleRemoveTag: removeTag,
    };
  }, [addTag, disabled, removeTag]);

  return (
    <Card>
      <div className="flex justify-between items-center gap-2 mb-2">
        <H4 className="text-center whitespace-nowrap pt-3">
          <TagsIcon className="inline-block mr-1 w-5 h-5" />
          Clip Tags
        </H4>
      </div>

      <div className="flex flex-row items-center flex-wrap gap-1">
        {tags?.map((tag: Tag) => (
          <TagComponent
            key={getTagKey(tag)}
            tag={tag}
            onClick={() => onTagClick?.(tag)}
            onClose={() => handleRemoveTag?.(tag)}
            count={null}
          />
        ))}
        {tags?.length === 0 && (
          <span className="text-stone-400 dark:text-stone-600 text-sm">
            No tags
          </span>
        )}
        {!disabled && (
          <AddTagButton 
            variant="primary" 
            onAdd={handleAddTag} 
          />
        )}
      </div>
    </Card>
  );
}
